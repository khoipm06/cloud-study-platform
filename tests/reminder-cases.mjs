import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {readFileSync} from 'node:fs';

export async function runReminderChecks({request,ok,database,owner,push,reminders}) {
  // Published RFC 8291 section 5 vector; deliberately public fixture keys.
  const ua='BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
  const as='BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
  const sender=push.decode64(as);
  const jwk={kty:'EC',crv:'P-256',d:'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',x:push.base64url(sender.slice(1,33)),y:push.base64url(sender.slice(33))};
  const privateKey=await crypto.subtle.importKey('jwk',jwk,{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
  const encrypted=await push.encryptPush(ua,'BTBZMqHH6r4Tts7J_aSIgg','When I grow up, I want to be a watermelon',{
    privateKey,publicKey:sender,salt:push.decode64('DGv6ra1nlYgDCS1FRnbzlw'),
  });
  assert.equal(push.base64url(encrypted),'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
  await assert.rejects(()=>push.validatePushKeys(push.base64url(new Uint8Array(65).fill(4)), 'BTBZMqHH6r4Tts7J_aSIgg'));
  for(const url of ['http://fcm.googleapis.com/x','https://127.0.0.1/x','https://fcm.googleapis.com.evil.test/x','https://evil.test@fcm.googleapis.com/x','https://fcm.googleapis.com:444/x','https://fcm.googleapis.com/x#token'])assert.equal(push.allowedPushEndpoint(url),false);
  assert.equal(push.allowedPushEndpoint('https://web.push.apple.com/push/token'),true);
  assert.equal(push.allowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/token'),true);
  console.log('PASS RFC 8291 encryption vector, curve validation and push endpoint SSRF boundaries');

  const a={userId:'reminder-a',displayName:'Người học nhắc lịch',email:'reminder-a@example.test'};
  const b={userId:'reminder-b',displayName:'Người học riêng tư',email:'reminder-b@example.test'};
  for(const person of [a,b])ok('create reminder test identity '+person.userId,await request(person,'state'));
  ok('push settings require authentication',await request(null,'push-settings'),401);
  assert.equal(ok('push settings accurately report absent configuration',await request(a,'push-settings')).configured,false);
  ok('subscription unavailable without configuration',await request(a,'push-subscribe',{}),503);
  globalThis.__mohocTest.env.VAPID_PRIVATE_JWK=JSON.stringify({...jwk,key_ops:['sign']});
  globalThis.__mohocTest.env.VAPID_SUBJECT='https://test.local';
  const keyConfig=ok('configured push exposes public key only',await request(a,'push-settings'));
  assert.equal(keyConfig.public_key,as);assert.ok(!JSON.stringify(keyConfig).includes(jwk.d));
  const keys={p256dh:ua,auth:'BTBZMqHH6r4Tts7J_aSIgg'}, endpoint='https://fcm.googleapis.com/fcm/send/reminder-fixture-';
  const payload={endpoint:endpoint+'1',keys,label:'Laptop học tập'};
  ok('subscription rejects unknown endpoint host',await request(a,'push-subscribe',{...payload,endpoint:'https://internal.example.test/secret'}),422);
  ok('subscription rejects invalid curve key',await request(a,'push-subscribe',{...payload,keys:{...keys,p256dh:push.base64url(new Uint8Array(65).fill(4))}}),422);
  ok('subscription rejects malformed auth secret',await request(a,'push-subscribe',{...payload,keys:{...keys,auth:'abc'}}),422);
  const sub=ok('explicit opt-in registers current device',await request(a,'push-subscribe',payload),201);
  assert.equal(ok('repeated opt-in is idempotent',await request(a,'push-subscribe',payload)).id,sub.id);
  ok('another account cannot take over device',await request(b,'push-subscribe',payload),409);
  assert.equal(ok('another user does not see device metadata',await request(b,'push-settings')).devices.length,0);
  const listed=ok('device directory redacts endpoints and encryption keys',await request(a,'push-settings'));
  assert.equal(listed.devices[0].id,sub.id);assert.equal(listed.devices[0].endpoint,undefined);assert.equal(listed.devices[0].auth,undefined);assert.equal(listed.devices[0].p256dh,undefined);
  const extra=[];
  for(let i=2;i<=5;i++)extra.push(ok('register bounded additional device '+i,await request(a,'push-subscribe',{...payload,endpoint:endpoint+i}),201));
  ok('sixth device is rejected',await request(a,'push-subscribe',{...payload,endpoint:endpoint+'6'}),409);
  ok('other user cannot unsubscribe device',await request(b,'push-unsubscribe',{id:sub.id}),404);
  ok('other user cannot test device',await request(b,'push-test',{id:sub.id}),404);
  for(const x of extra)ok('owner revokes an old device',await request(a,'push-unsubscribe',{id:x.id}));

  const config=await push.pushConfiguration(globalThis.__mohocTest.env);
  assert.equal((await push.pushRuntimeCheck(globalThis.__mohocTest.env)).ok,true);
  const validJWK=globalThis.__mohocTest.env.VAPID_PRIVATE_JWK;
  globalThis.__mohocTest.env.VAPID_PRIVATE_JWK='invalid';
  ok('invalid push configuration is reported safely',await request(a,'push-settings'),503);
  const partial=ok('invalid push configuration does not stop backups and maintenance',await request(owner,'operations-run',{backup_if_due:false}));
  assert.equal(partial.push.configured,false);assert.ok(partial.push.error);
  globalThis.__mohocTest.env.VAPID_PRIVATE_JWK=validJWK;
  const originalFetch=globalThis.fetch;let calls=0,nextStatus=201,authVerified=false;
  globalThis.fetch=async(url,options)=>{
    assert.ok(String(url).startsWith(endpoint));assert.equal(options.method,'POST');assert.equal(options.redirect,'error');
    assert.equal(options.headers['Content-Encoding'],'aes128gcm');assert.ok(options.body instanceof Uint8Array);
    assert.ok(!new TextDecoder().decode(options.body).includes('Bạn có lịch'));
    const match=/^vapid t=([^,]+), k=(.+)$/.exec(options.headers.Authorization);assert.ok(match);assert.equal(match[2],as);
    const [header,body,signature]=match[1].split('.');const claims=JSON.parse(new TextDecoder().decode(push.decode64(body)));
    assert.equal(claims.aud,'https://fcm.googleapis.com');assert.equal(claims.sub,'https://test.local/');assert.ok(claims.exp>Date.now()/1000&&claims.exp<Date.now()/1000+86400);
    const publicKey=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y},{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
    authVerified=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},publicKey,push.decode64(signature),new TextEncoder().encode(header+'.'+body));assert.equal(authVerified,true);
    calls++;return new Response(null,{status:nextStatus});
  };
  const iso=minutes=>new Date(Date.now()+minutes*60000).toISOString();
  try {
    assert.equal(ok('self-test records provider acceptance without claiming display',await request(a,'push-test',{id:sub.id})).accepted,true);
    assert.ok(authVerified);ok('test sends are throttled per device',await request(a,'push-test',{id:sub.id}),429);
    const c=ok('create course for reminder integration',await request(owner,'course-save',{title:'Nhắc học và lịch riêng tư',description:'Khóa kiểm thử nhắc học, lịch và quyền truy cập.',category:'Công nghệ',level:'Cơ bản'}),201);
    const l=ok('add reminder lesson',await request(owner,'lesson-save',{course_id:c.id,title:'Lập kế hoạch học',content:'Nội dung học đủ dài để phục vụ kiểm thử nhắc học.',minutes:15}),201);
    const courseRow=()=>database.prepare('SELECT * FROM courses WHERE id=?').get(c.id);
    ok('save required course quiz',await request(owner,'quiz-save',{course_id:c.id,version:courseRow().version,questions:[{id:'reminder-q',prompt:'Lịch học giúp ích điều gì?',options:['Lên kế hoạch','Bỏ qua việc học'],correct:0,explanation:'Dành thời gian cho việc học.'}]}));
    ok('publish reminder course',await request(owner,'course-status',{course_id:c.id,version:courseRow().version,status:'PUBLISHED'}));
    for(const person of [a,b])ok('enroll private planner user '+person.userId,await request(person,'enroll',{course_id:c.id}));
    const goalPayload={title:'Duy trì nhịp học',course_id:c.id,target_date:new Date(Date.now()+30*86400000).toISOString().slice(0,10),weekly_minutes:90,timezone:'America/New_York'};
    const goal=ok('create reminder goal',await request(a,'goal-save',goalPayload),201);
    const otherGoal=ok('other user creates private goal',await request(b,'goal-save',goalPayload),201);
    const body={goal_id:goal.id,title:'Phiên riêng, dấu ; và tiếng Việt',lesson_id:l.id,starts_at:iso(10),duration_minutes:30,timezone:'America/New_York',reminder_minutes:15};
    const session=ok('create due push study session',await request(a,'session-save',body),201);
    await request(b,'session-save',{...body,goal_id:otherGoal.id,title:'PHIEN_RIENG_CUA_NGUOI_KHAC'});
    const range=new URLSearchParams({from:iso(-60),to:iso(1440)});
    ok('calendar download requires authentication',await request(null,'planner-calendar?'+range),401);
    ok('calendar limits export to 93 days',await request(a,'planner-calendar?'+new URLSearchParams({from:iso(-60),to:iso(140000)})),422);
    ok('calendar rejects missing boundaries',await request(a,'planner-calendar'),422);
    ok('calendar rejects ambiguous time without timezone',await request(a,'planner-calendar?from=2026-11-01T00:00:00&to=2026-11-02T00:00:00'),422);
    const calendarResponse=await request(a,'planner-calendar?'+range);ok('download own calendar with reminders',calendarResponse);
    const calendar=calendarResponse.data;
    assert.match(calendarResponse.res.headers.get('Content-Type'),/^text\/calendar/);assert.equal(calendarResponse.res.headers.get('Cache-Control'),'private, no-store');
    assert.ok(calendar.includes('TRIGGER:-PT15M'));assert.ok(!calendar.includes('PHIEN_RIENG_CUA_NGUOI_KHAC'));assert.ok(!calendar.includes(a.email));
    assert.ok(calendar.replace(/\r\n /g,'').includes('SUMMARY:Phiên riêng\\, dấu \\; và tiếng Việt'));
    for(const line of calendar.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
    const baseline=calls;nextStatus=503;
    let summary=ok('provider outage does not prevent operations success',await request(owner,'operations-run',{backup_if_due:false}));
    assert.equal(summary.push.failed,1);assert.equal(calls,baseline+1);
    let delivery=()=>database.prepare('SELECT * FROM push_deliveries WHERE subscription_id=?').get(sub.id);
    assert.equal(delivery().status,'RETRY');
    ok('backoff prevents repeated immediate sends',await request(owner,'operations-run',{backup_if_due:false}));assert.equal(calls,baseline+1);
    database.prepare('UPDATE push_deliveries SET next_attempt_at=? WHERE subscription_id=?').run(iso(-1),sub.id);nextStatus=201;
    summary=ok('due retry is accepted by provider',await request(owner,'operations-run',{backup_if_due:false}));assert.equal(summary.push.accepted,1);assert.equal(delivery().status,'SENT');
    ok('successful study push is not sent twice',await request(owner,'operations-run',{backup_if_due:false}));assert.equal(calls,baseline+2);

    const resetQueue=()=>database.prepare("UPDATE push_deliveries SET status='RETRY',attempts=1,next_attempt_at=? WHERE subscription_id=?").run(iso(-1),sub.id);
    resetQueue();ok('read own reminder',await request(a,'notification-read',{all:true}));
    summary=ok('read reminders are skipped before network dispatch',await request(owner,'operations-run',{backup_if_due:false}));assert.equal(summary.push.skipped,1);assert.equal(calls,baseline+2);
    database.prepare('UPDATE learning_notifications SET read_at=NULL WHERE user_id=?').run(a.userId);
    resetQueue();database.prepare('UPDATE members SET blocked=1 WHERE id=?').run(a.userId);
    summary=ok('blocked recipient is skipped before network dispatch',await request(owner,'operations-run',{backup_if_due:false}));assert.equal(summary.push.skipped,1);assert.equal(calls,baseline+2);
    database.prepare('UPDATE members SET blocked=0 WHERE id=?').run(a.userId);
    resetQueue();ok('disable all study reminders',await request(a,'learning-preferences',{timezone:'America/New_York',reminders_enabled:false,version:0}));
    summary=ok('opted-out recipient receives no push',await request(owner,'operations-run',{backup_if_due:false}));assert.equal(summary.push.skipped,1);assert.equal(calls,baseline+2);
    assert.ok(!(await request(a,'planner-calendar?'+range)).data.includes('BEGIN:VALARM'));
    ok('re-enable study reminders',await request(a,'learning-preferences',{timezone:'America/New_York',reminders_enabled:true,version:1}));
    await request(a,'notifications');resetQueue();database.prepare('UPDATE courses SET hidden=1 WHERE id=?').run(c.id);
    summary=ok('hidden course prevents queued push',await request(owner,'operations-run',{backup_if_due:false}));assert.equal(summary.push.skipped,1);assert.equal(calls,baseline+2);
    assert.ok(!(await request(a,'planner-calendar?'+range)).data.includes('BEGIN:VEVENT'));
    database.prepare('UPDATE courses SET hidden=0 WHERE id=?').run(c.id);
    resetQueue();ok('archive study goal',await request(a,'goal-status',{id:goal.id,version:1,status:'ARCHIVED'}));
    summary=ok('archived goal cancels queued push',await request(owner,'operations-run',{backup_if_due:false}));assert.equal(summary.push.skipped,1);assert.equal(calls,baseline+2);
    assert.ok((await request(a,'planner-calendar?'+range)).data.includes('STATUS:CANCELLED'));
    ok('resume goal',await request(a,'goal-status',{id:goal.id,version:2,status:'ACTIVE'}));await request(a,'notifications');resetQueue();nextStatus=410;
    summary=ok('expired endpoint is removed automatically',await request(owner,'operations-run',{backup_if_due:false}));assert.equal(summary.push.expired,1);assert.equal(database.prepare('SELECT count(*) n FROM push_subscriptions WHERE id=?').get(sub.id).n,0);
    assert.equal(database.prepare('SELECT count(*) n FROM push_deliveries WHERE subscription_id=?').get(sub.id).n,0);
    const renewed=ok('browser can subscribe again after expiration',await request(a,'push-subscribe',payload),201);
    await request(a,'notifications'); // Notifications created before a new consent are not sent retroactively.
    const before=calls;ok('new device does not receive historical reminders',await request(owner,'operations-run',{backup_if_due:false}));assert.equal(calls,before);
    ok('cancel planned study session',await request(a,'session-status',{id:session.id,version:1,status:'CANCELLED'}));
    const cancelledCalendar=ok('calendar exports cancellation with stable UID',await request(a,'planner-calendar?'+range));
    assert.ok(cancelledCalendar.includes('STATUS:CANCELLED'));assert.ok(!cancelledCalendar.includes('BEGIN:VALARM'));
    assert.equal(cancelledCalendar.match(/^UID:.+$/m)[0],calendar.match(/^UID:.+$/m)[0]);
    // Leave a device for the existing full-restore cases, which must clear ephemeral credentials.
    assert.equal(renewed.id,sub.id);
    const ops=ok('admin sees push runtime and aggregate delivery states',await request(owner,'operations'));
    assert.equal(ops.push_runtime.ok,true);assert.ok(Array.isArray(ops.push_queue));
  } finally { globalThis.fetch=originalFetch;delete globalThis.__mohocTest.env.VAPID_PRIVATE_JWK;delete globalThis.__mohocTest.env.VAPID_SUBJECT; }

  const sample={id:'event-fixture',title:'Tiếng Việt 🧑🏽‍💻 '.repeat(12)+'\r\nBEGIN:VEVENT',course_title:'Lịch riêng',course_id:'course',lesson_id:null,
    starts_at:'2026-11-01T05:30:00.000Z',duration_minutes:120,timezone:'America/New_York',status:'PLANNED',goal_status:'ACTIVE',version:2,goal_version:1,
    reminder_minutes:0,updated_at:'2026-10-31T00:00:00.000Z'};
  const dst=reminders.studyCalendar([sample],'https://test.local',true,'2026-10-30T00:00:00.000Z');
  assert.ok(dst.includes('DTSTART:20261101T053000Z'));assert.ok(dst.includes('DTEND:20261101T073000Z'));assert.ok(dst.includes('TRIGGER:-PT0M'));
  for(const line of dst.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
  const unfolded=dst.replace(/\r\n /g,'');assert.equal((unfolded.match(/^BEGIN:VEVENT$/gm)||[]).length,1);assert.ok(unfolded.includes(sample.title.replace(/\r\n/g,'\\n')));
  const events={};let notice,opened;
  const self={location:{origin:'https://test.local'},addEventListener:(name,fn)=>events[name]=fn,
    registration:{showNotification:async(title,options)=>notice={title,...options}},clients:{matchAll:async()=>[],openWindow:async url=>opened=url}};
  runInNewContext(readFileSync(new URL('../public/mo-hoc-sw.js',import.meta.url),'utf8'),{self,URL});
  let pending;events.push({data:{json:()=>({title:'private title',body:'private body',route:'https://evil.test/',tag:'study-fixture'})},waitUntil:p=>pending=p});await pending;
  assert.ok(!JSON.stringify(notice).includes('private'));assert.ok(!JSON.stringify(notice).includes('evil.test'));
  events.notificationclick({notification:{close(){}},waitUntil:p=>pending=p});await pending;assert.equal(opened,'https://test.local/#planner');
  assert.equal(events.fetch,undefined);
  console.log('PASS VAPID signature, push consent/retries/privacy, private ICS export/DST/injection and service-worker safety checks');
}
