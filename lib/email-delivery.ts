// This gateway contract is provider-independent. No message is sent without explicit runtime configuration.
const encoder = new TextEncoder();
export async function tokenHash(token: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token))))
    .map(n => n.toString(16).padStart(2, '0')).join('');
}
export function emailConfiguration(env: any) {
  try {
    const url = new URL(env.EMAIL_GATEWAY_URL || '');
    if (url.protocol !== 'https:' || url.username || url.password || url.hash ||
        !env.EMAIL_GATEWAY_TOKEN || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(env.EMAIL_FROM || '')) return false;
    return true;
  } catch { return false; }
}
export async function issueEmailToken(s: any, req: Request, account: any, purpose: 'VERIFY' | 'RESET') {
  if (!emailConfiguration(s.env)) return { accepted: false };
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(n => n.toString(16).padStart(2, '0')).join('');
  const hash = await tokenHash(token), id = s.uid(), expires = new Date(Date.now() + (purpose === 'VERIFY' ? 86400000 : 1800000)).toISOString();
  await s.run('INSERT INTO email_tokens(token_hash,user_id,email,purpose,credential_version,expires_at,created_at) VALUES(?,?,?,?,?,?,?)',
    hash, account.user_id, account.email, purpose, account.version, expires, s.now());
  const link = new URL(req.url).origin + '/#auth/' + (purpose === 'VERIFY' ? 'verify/' : 'reset/') + token;
  const text = purpose === 'VERIFY'
    ? `Cloud study platform — Xác minh địa chỉ email\n\nMở liên kết và chọn Xác minh email trong 24 giờ:\n${link}\n\nTài khoản vẫn cần quản trị duyệt. Nếu không yêu cầu, bạn có thể bỏ qua email này.`
    : `Cloud study platform — Đặt lại mật khẩu\n\nMở liên kết để đặt mật khẩu mới trong 30 phút:\n${link}\n\nNếu không yêu cầu, bạn có thể bỏ qua email này. Mật khẩu chưa bị thay đổi.`;
  try {
    const res = await fetch(s.env.EMAIL_GATEWAY_URL, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.env.EMAIL_GATEWAY_TOKEN, 'Idempotency-Key': id },
      body: JSON.stringify({ from: s.env.EMAIL_FROM, to: account.email, subject: purpose === 'VERIFY' ? 'Xác minh email Cloud study platform' : 'Đặt lại mật khẩu Cloud study platform', text, idempotency_key: id })
    });
    await res.body?.cancel();
    if (!res.ok) throw new Error('delivery');
    // Keep earlier, still-valid links until successful consumption. A failed resend must not revoke them.
    return { accepted: true };
  } catch {
    await s.run('DELETE FROM email_tokens WHERE token_hash=?', hash);
    return { accepted: false };
  }
}
export async function emailToken(s: any, token: any, purpose: 'VERIFY' | 'RESET') {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) s.fail(422, 'Liên kết không hợp lệ hoặc đã hết hạn.');
  const hash = await tokenHash(token);
  const found = await s.one(`SELECT t.*,a.version,a.status,m.blocked FROM email_tokens t JOIN auth_accounts a ON a.user_id=t.user_id JOIN members m ON m.id=t.user_id
    WHERE t.token_hash=? AND t.purpose=? AND t.used_at IS NULL AND t.expires_at>? AND t.email=a.email AND t.credential_version=a.version`, hash, purpose, s.now());
  if (!found || found.blocked || found.status === 'DISABLED' || (purpose === 'RESET' && found.status !== 'ACTIVE')) s.fail(422, 'Liên kết không hợp lệ hoặc đã hết hạn.');
  return found;
}
