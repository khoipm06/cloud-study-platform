import {allowedPushEndpoint, validatePushKeys, pushConfiguration, sendWebPush, base64url} from './web-push';
const eligible = `n.invalidated=0 AND n.read_at IS NULL AND n.kind='STUDY' AND m.blocked=0
  AND c.hidden=0 AND c.status IN('PUBLISHED','ARCHIVED') AND g.status='ACTIVE' AND x.status='PLANNED'
  AND (p.reminders_enabled IS NULL OR p.reminders_enabled=1)
  AND EXISTS(SELECT 1 FROM enrollments e WHERE e.user_id=n.user_id AND e.course_id=n.course_id)
  AND julianday(x.starts_at)+x.duration_minutes/1440.0>julianday(?)`;
const joins = `JOIN learning_notifications n ON n.id=d.notification_id JOIN members m ON m.id=n.user_id
  JOIN courses c ON c.id=n.course_id JOIN study_sessions x ON x.id=n.session_id
  JOIN learning_goals g ON g.id=x.goal_id LEFT JOIN learning_preferences p ON p.user_id=n.user_id`;
async function configured(s: any) {
  try { return await pushConfiguration(s.env); }
  catch { s.fail(503, 'Cấu hình thông báo trình duyệt chưa hợp lệ.'); }
}
export async function reminderRead(s: any, req: Request, path: string[], u: any) {
  if (path[0] !== 'push-settings') return null;
  const config = await configured(s);
  return s.json({configured: !!config, public_key: config?.publicKey,
    devices: await s.all('SELECT id,label,created_at,last_success_at,last_status FROM push_subscriptions WHERE user_id=? ORDER BY created_at DESC', u.id),
    schedule_minutes: 60});
}
export async function reminderWrite(s: any, path: string[], u: any, b: any) {
  if (!['push-subscribe', 'push-unsubscribe', 'push-test'].includes(path[0])) return null;
  if (path[0] === 'push-unsubscribe') {
    const id = s.str(b.id);
    if (!await s.one('SELECT 1 FROM push_subscriptions WHERE id=? AND user_id=?', id, u.id)) s.fail(404, 'Không tìm thấy thiết bị của bạn.');
    await s.run('DELETE FROM push_subscriptions WHERE id=? AND user_id=?', id, u.id);
    return s.json({ok: true});
  }
  if (!await configured(s)) s.fail(503, 'Chưa cấu hình nhắc học qua trình duyệt.');
  if (path[0] === 'push-subscribe') {
    if (!allowedPushEndpoint(b.endpoint)) s.fail(422, 'Địa chỉ dịch vụ push chưa được hỗ trợ.');
    try { await validatePushKeys(b.keys?.p256dh, b.keys?.auth); }
    catch { s.fail(422, 'Khóa đăng ký thông báo không hợp lệ.'); }
    const existing = await s.one('SELECT * FROM push_subscriptions WHERE endpoint=?', b.endpoint);
    if (existing && existing.user_id !== u.id) s.fail(409, 'Thiết bị đã đăng ký với tài khoản khác. Tắt thông báo trên thiết bị rồi bật lại.');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(b.endpoint));
    const id = existing?.id || base64url(new Uint8Array(digest)), label = s.str(b.label || 'Thiết bị của tôi', 1, 80);
    // A retry is idempotent; the count guard also holds for concurrent requests.
    const result = await s.run(`INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,label,created_at)
      SELECT ?,?,?,?,?,?,? WHERE (SELECT count(*) FROM push_subscriptions WHERE user_id=?)<5 OR EXISTS(SELECT 1 FROM push_subscriptions WHERE id=? AND user_id=?)
      ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,label=excluded.label
      WHERE push_subscriptions.user_id=excluded.user_id`, id, u.id, b.endpoint, b.keys.p256dh, b.keys.auth, label, s.now(), u.id, id, u.id);
    if (!result.meta.changes) s.fail(409, 'Tối đa 5 thiết bị. Hãy tắt một thiết bị trước khi thêm.');
    return s.json({id}, existing ? 200 : 201);
  }
  const device = await s.one('SELECT * FROM push_subscriptions WHERE id=? AND user_id=?', s.str(b.id), u.id);
  if (!device) s.fail(404, 'Không tìm thấy thiết bị của bạn.');
  const next = new Date(Date.now()+60000).toISOString();
  const claim = await s.run('UPDATE push_subscriptions SET test_after=? WHERE id=? AND user_id=? AND (test_after IS NULL OR test_after<=?)', next, device.id, u.id, s.now());
  if (!claim.meta.changes) s.fail(429, 'Mỗi thiết bị gửi thử tối đa một lần mỗi phút.');
  let status: number;
  try { status = await sendWebPush(s.env, device, 'mohoc-test', true); }
  catch { s.fail(502, 'Chưa gửi được tới dịch vụ thông báo. Bạn có thể thử lại sau.'); }
  if ([404, 410].includes(status!)) {
    await s.run('DELETE FROM push_subscriptions WHERE id=? AND user_id=? AND created_at=? AND p256dh=? AND auth=?', device.id, u.id, device.created_at, device.p256dh, device.auth);
    s.fail(410, 'Đăng ký trên thiết bị đã hết hạn. Hãy bật lại thông báo.');
  }
  await s.run('UPDATE push_subscriptions SET last_status=?,last_success_at=CASE WHEN ? BETWEEN 200 AND 299 THEN ? ELSE last_success_at END WHERE id=? AND user_id=? AND created_at=? AND p256dh=? AND auth=?', status!, status!, s.now(), device.id, u.id, device.created_at, device.p256dh, device.auth);
  if (status! < 200 || status! >= 300) s.fail(502, 'Dịch vụ thông báo chưa chấp nhận yêu cầu.');
  return s.json({accepted: true, message: 'Dịch vụ đã nhận yêu cầu. Kiểm tra thông báo trên thiết bị; việc hiển thị còn tùy trình duyệt và hệ điều hành.'});
}
export async function dispatchStudyPush(s: any) {
  let config;
  try { config = await pushConfiguration(s.env); }
  catch { return {configured: false, accepted: 0, failed: 0, expired: 0, skipped: 0, error: 'Cấu hình push không hợp lệ; các tác vụ khác tiếp tục.'}; }
  const summary = {configured: !!config, accepted: 0, failed: 0, expired: 0, skipped: 0};
  if (!config) return summary;
  await s.run(`INSERT OR IGNORE INTO push_deliveries(notification_id,subscription_id,status,next_attempt_at)
    SELECT n.id,z.id,'PENDING',? FROM learning_notifications n JOIN push_subscriptions z ON z.user_id=n.user_id
    JOIN members m ON m.id=n.user_id JOIN courses c ON c.id=n.course_id JOIN study_sessions x ON x.id=n.session_id
    JOIN learning_goals g ON g.id=x.goal_id LEFT JOIN learning_preferences p ON p.user_id=n.user_id
    WHERE ${eligible} AND n.created_at>=z.created_at AND n.created_at>?`, s.now(), s.now(), new Date(Date.now()-86400000).toISOString());
  const rows = await s.all(`SELECT d.notification_id,d.subscription_id,d.attempts FROM push_deliveries d
    WHERE d.status IN('PENDING','RETRY','SENDING') AND d.attempts<5 AND d.next_attempt_at<=? ORDER BY d.next_attempt_at LIMIT 20`, s.now());
  for (let offset=0; offset<rows.length; offset+=5) await Promise.all(rows.slice(offset,offset+5).map(async (row: any) => {
    const reserved = await s.run(`UPDATE push_deliveries SET status='SENDING',attempts=attempts+1,next_attempt_at=?
      WHERE notification_id=? AND subscription_id=? AND attempts=? AND status IN('PENDING','RETRY','SENDING') AND next_attempt_at<=?`,
      new Date(Date.now()+120000).toISOString(), row.notification_id, row.subscription_id, row.attempts, s.now());
    if (!reserved.meta.changes) return;
    const device = await s.one(`SELECT z.* FROM push_deliveries d JOIN push_subscriptions z ON z.id=d.subscription_id ${joins}
      WHERE d.notification_id=? AND d.subscription_id=? AND z.user_id=n.user_id AND ${eligible}`, row.notification_id, row.subscription_id, s.now());
    if (!device) {
      await s.run("UPDATE push_deliveries SET status='SKIPPED' WHERE notification_id=? AND subscription_id=?", row.notification_id,row.subscription_id);
      summary.skipped++; return;
    }
    let status = 0;
    try { status = await sendWebPush(s.env, device, 'study-'+row.notification_id); } catch { /* Retry without logging endpoint credentials. */ }
    if ([404,410].includes(status)) {
      await s.run('DELETE FROM push_subscriptions WHERE id=? AND created_at=? AND p256dh=? AND auth=?', device.id,device.created_at,device.p256dh,device.auth); summary.expired++; return;
    }
    const accepted = status>=200 && status<300;
    const permanent = status>=400 && status<500 && status!==408 && status!==429;
    const deliveryStatus = accepted ? 'SENT' : permanent || row.attempts>=4 ? 'FAILED' : 'RETRY';
    await s.db().batch([
      s.statement("UPDATE push_deliveries SET status=?,last_status=?,next_attempt_at=? WHERE notification_id=? AND subscription_id=? AND status='SENDING' AND attempts=?",
        deliveryStatus,status,new Date(Date.now()+Math.min(24,2**row.attempts)*3600000).toISOString(),row.notification_id,row.subscription_id,row.attempts+1),
      s.statement('UPDATE push_subscriptions SET last_status=?,last_success_at=CASE WHEN ? THEN ? ELSE last_success_at END WHERE id=? AND created_at=? AND p256dh=? AND auth=?',status,accepted?1:0,s.now(),device.id,device.created_at,device.p256dh,device.auth),
    ]);
    if (accepted) summary.accepted++; else summary.failed++;
  }));
  await s.run('DELETE FROM push_deliveries WHERE notification_id IN(SELECT id FROM learning_notifications WHERE created_at<?)', new Date(Date.now()-7*86400000).toISOString());
  return summary;
}
// RFC 5545: escape content, fold by UTF-8 octets, and emit UTC for DST-safe import.
function text(value: string) { return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,'); }
function fold(line: string) {
  const lines: string[] = []; let part='',size=0;
  for (const char of line) {
    const bytes=new TextEncoder().encode(char).length;
    if (size+bytes>75) { lines.push(part); part=' '; size=1; }
    part+=char; size+=bytes;
  }
  return [...lines,part].join('\r\n');
}
const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
export function studyCalendar(rows: any[], origin: string, reminders: boolean, now: string) {
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Cloud study platform//Study planner//VI','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Lịch học Cloud study platform'];
  for (const x of rows) {
    const cancelled=x.status==='CANCELLED'||x.goal_status!=='ACTIVE';
    // UID does not contain a member ID or email.
    const uid=base64url(new TextEncoder().encode(x.id))+'@mo-hoc';
    lines.push('BEGIN:VEVENT','UID:'+uid,'DTSTAMP:'+stamp(now),'LAST-MODIFIED:'+stamp(x.goal_updated_at>x.updated_at?x.goal_updated_at:x.updated_at),
      'DTSTART:'+stamp(x.starts_at),'DTEND:'+stamp(new Date(Date.parse(x.starts_at)+x.duration_minutes*60000).toISOString()),
      'SEQUENCE:'+(x.version+x.goal_version),'SUMMARY:'+text(x.title),'DESCRIPTION:'+text(x.course_title+'\nMúi giờ đã chọn: '+x.timezone),
      'CLASS:PRIVATE','STATUS:'+(cancelled?'CANCELLED':'CONFIRMED'),
      'URL:'+origin+'/#'+(x.lesson_id?'learn/'+encodeURIComponent(x.course_id)+'/'+encodeURIComponent(x.lesson_id):'planner'));
    if (reminders && !cancelled && x.status==='PLANNED' && x.starts_at>now) lines.push('BEGIN:VALARM','ACTION:DISPLAY',
      'DESCRIPTION:Nhắc học Cloud study platform','TRIGGER:-PT'+x.reminder_minutes+'M','END:VALARM');
    lines.push('END:VEVENT');
  }
  return [...lines,'END:VCALENDAR'].map(fold).join('\r\n')+'\r\n';
}
export async function calendarRead(s: any, req: Request, path: string[], u: any) {
  if (path[0]!=='planner-calendar') return null;
  const query=new URL(req.url).searchParams, from=query.get('from'),to=query.get('to');
  const boundary=(value:string|null)=>value&&/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));
  if (!boundary(from)||!boundary(to)||Date.parse(to!)<=Date.parse(from!)||Date.parse(to!)-Date.parse(from!)>93*86400000) s.fail(422,'Chọn khoảng lịch có múi giờ rõ ràng, tối đa 93 ngày.');
  const rows=await s.all(`SELECT x.*,c.title course_title,g.status goal_status,g.version goal_version,g.updated_at goal_updated_at FROM study_sessions x
    JOIN courses c ON c.id=x.course_id JOIN learning_goals g ON g.id=x.goal_id
    WHERE x.user_id=? AND x.starts_at>=? AND x.starts_at<? AND c.hidden=0 AND c.status IN('PUBLISHED','ARCHIVED')
    AND EXISTS(SELECT 1 FROM enrollments e WHERE e.user_id=x.user_id AND e.course_id=x.course_id)
    ORDER BY x.starts_at,x.id LIMIT 1001`,u.id,new Date(from!).toISOString(),new Date(to!).toISOString());
  if (rows.length>1000) s.fail(422,'Quá 1.000 phiên học. Hãy chọn khoảng lịch ngắn hơn.');
  const pref=await s.one('SELECT reminders_enabled FROM learning_preferences WHERE user_id=?',u.id);
  return new Response(studyCalendar(rows,new URL(req.url).origin,pref?.reminders_enabled!==0,s.now()),{headers:{
    'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="cloud-study.ics"',
    'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
  }});
}
