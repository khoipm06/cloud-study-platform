// Web Push encryption (RFC 8291) and VAPID (RFC 8292), using Worker Web Crypto.
const utf8 = new TextEncoder();
export function base64url(bytes: Uint8Array) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decode64(value: string) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid base64url');
  const bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  if (base64url(bytes) !== value) throw new Error('Noncanonical base64url');
  return bytes;
}
function join(...values: Uint8Array[]) {
  const result = new Uint8Array(values.reduce((n, v) => n + v.length, 0));
  let offset = 0;
  for (const value of values) { result.set(value, offset); offset += value.length; }
  return result;
}
async function hmac(key: Uint8Array, input: Uint8Array) {
  const k = await crypto.subtle.importKey('raw', key as BufferSource, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, input as BufferSource));
}
export function allowedPushEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const u = new URL(value);
    const host = u.hostname;
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && !u.hash && u.pathname.length > 1 &&
      (host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' ||
       /^[a-z0-9-]+\.push\.apple\.com$/.test(host) || /^[a-z0-9-]+\.notify\.windows\.com$/.test(host));
  } catch { return false; }
}
export async function validatePushKeys(p256dh: string, auth: string) {
  const key = decode64(p256dh), secret = decode64(auth);
  if (key.length !== 65 || key[0] !== 4 || secret.length !== 16) throw new Error('Invalid push keys');
  await crypto.subtle.importKey('raw', key as BufferSource, {name: 'ECDH', namedCurve: 'P-256'}, false, []);
}
export async function pushConfiguration(env: any) {
  if (!env.VAPID_PRIVATE_JWK || !env.VAPID_SUBJECT) return null;
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || decode64(jwk.d).length !== 32 ||
      decode64(jwk.x).length !== 32 || decode64(jwk.y).length !== 32) throw new Error('Invalid VAPID configuration');
  const subject = new URL(env.VAPID_SUBJECT);
  if (!['https:', 'mailto:'].includes(subject.protocol)) throw new Error('Invalid VAPID subject');
  const key = await crypto.subtle.importKey('jwk', jwk, {name: 'ECDSA', namedCurve: 'P-256'}, false, ['sign']);
  return {key, publicKey: base64url(join(new Uint8Array([4]), decode64(jwk.x), decode64(jwk.y))), subject: subject.href};
}
export async function encryptPush(p256dh: string, auth: string, payload: string,
  fixture?: {privateKey: CryptoKey; publicKey: Uint8Array; salt: Uint8Array}) {
  const receiver = decode64(p256dh), secret = decode64(auth), plaintext = utf8.encode(payload);
  if (plaintext.length > 3000) throw new Error('Push payload too large');
  const pair = fixture ? null : await crypto.subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveBits']);
  const sender = fixture?.publicKey || new Uint8Array(await crypto.subtle.exportKey('raw', pair!.publicKey));
  const salt = fixture?.salt || crypto.getRandomValues(new Uint8Array(16));
  const ua = await crypto.subtle.importKey('raw', receiver as BufferSource, {name: 'ECDH', namedCurve: 'P-256'}, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({name: 'ECDH', public: ua}, fixture?.privateKey || pair!.privateKey, 256));
  const prkKey = await hmac(secret, shared);
  const ikm = await hmac(prkKey, join(utf8.encode('WebPush: info\0'), receiver, sender, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, join(utf8.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, join(utf8.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv: nonce}, aes, join(plaintext, new Uint8Array([2]))));
  const header = new Uint8Array(21);
  header.set(salt); new DataView(header.buffer).setUint32(16, 4096); header[20] = sender.length;
  return join(header, sender, ciphertext);
}
export async function vapidAuthorization(config: NonNullable<Awaited<ReturnType<typeof pushConfiguration>>>, endpoint: string) {
  const header = base64url(utf8.encode(JSON.stringify({typ: 'JWT', alg: 'ES256'})));
  const body = base64url(utf8.encode(JSON.stringify({aud: new URL(endpoint).origin, exp: Math.floor(Date.now()/1000)+3600, sub: config.subject})));
  const input = header + '.' + body;
  const signature = new Uint8Array(await crypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, config.key, utf8.encode(input)));
  return `vapid t=${input}.${base64url(signature)}, k=${config.publicKey}`;
}
export async function sendWebPush(env: any, device: any, tag: string, test = false) {
  if (!allowedPushEndpoint(device.endpoint)) throw new Error('Invalid push endpoint');
  const config = await pushConfiguration(env);
  if (!config) throw new Error('Push not configured');
  // No course names, private notes, or meeting links appear on a lock screen.
  const body = await encryptPush(device.p256dh, device.auth, JSON.stringify({
    title: 'Cloud study platform', body: test ? 'Thông báo thử đã đến thiết bị này.' : 'Bạn có lịch học đến hạn. Mở kế hoạch để xem chi tiết.',
    tag, route: 'planner',
  }));
  const response = await fetch(device.endpoint, {method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
    headers: {Authorization: await vapidAuthorization(config, device.endpoint), 'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream', TTL: '3600', Urgency: 'normal'}, body: body as BodyInit});
  // Provider response bodies may contain endpoint identifiers; never return or log them.
  await response.body?.cancel();
  return response.status;
}
export async function pushRuntimeCheck(env: any) {
  try {
    const config = await pushConfiguration(env);
    if (!config) return {configured: false, ok: false};
    const key = decode64(config.publicKey);
    const publicKey = await crypto.subtle.importKey('raw', key as BufferSource, {name:'ECDSA',namedCurve:'P-256'}, false, ['verify']);
    const payload = utf8.encode('Cloud study platform runtime check');
    const signature = await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'}, config.key, payload);
    const verified = await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'}, publicKey, signature, payload);
    const encrypted = await encryptPush(config.publicKey, base64url(crypto.getRandomValues(new Uint8Array(16))), 'runtime');
    return {configured: true, ok: verified && encrypted.length > 86, algorithm: 'P-256 / AES-128-GCM / VAPID ES256'};
  } catch { return {configured: !!env.VAPID_PRIVATE_JWK, ok: false}; }
}
