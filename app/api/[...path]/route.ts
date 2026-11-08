import {authPublic,authRead,authWrite,passwordIdentity,hasPasswordSession} from '../../../lib/auth-services';
import {commercePublic,commerceRead,commerceWrite} from '../../../lib/commerce-services';
import {accountWalletBalance,legacySaleReview,marketplaceRead,marketplaceWrite} from '../../../lib/marketplace';
import {socialRead,socialWrite,socialUpload} from '../../../lib/social-services';
import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import {seedCourses} from '../../../lib/seed';
import {grade,redact,validQuiz,validAnswers,fileKind,videoSource, type Question} from '../../../lib/rules';
import {initializeFeatures,publicCatalog,featureRead,featureWrite,recommendations} from '../../../lib/features';
import {learningRead,learningWrite} from '../../../lib/learning-services';
import {advancedPublic,advancedRead,advancedWrite} from '../../../lib/advanced-services';
import {labRead,labWrite} from '../../../lib/lab-services';
import {operationsRead,operationsWrite,portableBackupImport} from '../../../lib/operations';
import {tutorRead,tutorWrite} from '../../../lib/tutor-services';
import {reminderRead,reminderWrite,calendarRead} from '../../../lib/reminder-services';
export const dynamic='force-dynamic';
const now=()=>new Date().toISOString();
const uid=()=>crypto.randomUUID();
class Failure extends Error { constructor(public status:number,message:string){super(message);} }
function fail(s:number,m:string):never{throw new Failure(s,m);}
const json=(v:any,s=200)=>Response.json(v,{status:s,headers:{'Cache-Control':'no-store'}});
function db(){if(!env.DB)fail(503,'Cơ sở dữ liệu chưa sẵn sàng.');return env.DB!;}
function statement(sql:string,...args:any[]){return db().prepare(sql).bind(...args);}
async function one(sql:string,...args:any[]){return statement(sql,...args).first<any>();}
async function all(sql:string,...args:any[]){return (await statement(sql,...args).all<any>()).results;}
async function run(sql:string,...args:any[]){return statement(sql,...args).run();}
function str(v:any,min=1,max=150){if(typeof v!=='string'||v.trim().length<min||v.length>max)fail(422,`Nội dung cần từ ${min} đến ${max} ký tự.`);return v.trim();}
async function log(u:any,action:string,resource:string,reason=''){await run('INSERT INTO audit(id,actor_id,action,resource,created_at,reason,request_id) VALUES(?,?,?,?,?,?,?)',uid(),u.id,action,resource,now(),String(reason).slice(0,1000),uid());}
async function normalizeMemberRole(u:any){
 if(u.role==='ADMIN'||u.role==='LEARNER')return u;
 await run("UPDATE members SET role='LEARNER',version=version+1 WHERE id=? AND role NOT IN ('ADMIN','LEARNER')",u.id);
 const member=await one('SELECT * FROM members WHERE id=?',u.id);
 if(!member||member.blocked)fail(403,'Tài khoản đã bị tạm khóa.');
 return {...member,auth_provider:u.auth_provider};
}
async function identity(req:Request){
 const local=await passwordIdentity(services(),req);if(local)return normalizeMemberRole(local);
 const i=await getChatGPTUser(); if(!i)fail(401,'Đăng nhập để lưu hành trình học của bạn.');
 // Bootstrap requires an explicit operator-provided identity; public visitors never claim admin.
 if(env.BOOTSTRAP_ADMIN_EMAIL&&i!.email.toLowerCase()===env.BOOTSTRAP_ADMIN_EMAIL.toLowerCase())await run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)','owner',i!.userId);
 const owner=await one('SELECT value FROM settings WHERE key=?','owner');
 await run('INSERT OR IGNORE INTO members(id,name,email,role,created_at) VALUES(?,?,?,?,?)',i!.userId,i!.displayName,i!.email,owner?.value===i!.userId?'ADMIN':'LEARNER',now());
 const u=await one('SELECT * FROM members WHERE id=?',i!.userId);if(u.blocked)fail(403,'Tài khoản đã bị tạm khóa.');return normalizeMemberRole({...u,auth_provider:'CHATGPT'});
}
function sampleQuiz(c:any){const positions:Record<string,number[]>={'web-can-ban':[2,3,2]};return c.quiz.map((q:any,n:number)=>({...q,lesson_id:`${c.id}-${positions[c.id]?.[n]||n+1}`}));}
async function upgradeSampleQuiz(u:any){
 if(u.role!=='ADMIN'||await one("SELECT value FROM settings WHERE key='sample_links_v2'"))return;
 for(const sample of seedCourses){const c=await one('SELECT * FROM courses WHERE id=?',sample.id);if(!c)continue;const questions=JSON.parse(c.quiz);if(questions.length!==sample.quiz.length||!questions.every((q:any,i:number)=>q.id===sample.quiz[i].id&&q.prompt===sample.quiz[i].prompt&&q.correct===sample.quiz[i].correct&&JSON.stringify(q.options)===JSON.stringify(sample.quiz[i].options)))continue;
 const linked=sampleQuiz(sample);const updated=questions.map((q:any,i:number)=>q.lesson_id?q:{...q,lesson_id:linked[i].lesson_id});if(JSON.stringify(updated)===JSON.stringify(questions))continue;
 if((await all('SELECT id FROM lessons WHERE course_id=?',c.id)).length!==sample.lessons.length)continue;
 await db().batch([statement('INSERT OR IGNORE INTO quiz_revisions(course_id,revision,questions,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM courses WHERE id=? AND version=?)',c.id,c.quiz_revision,c.quiz,now(),c.id,c.version),statement('INSERT OR IGNORE INTO quiz_revisions(course_id,revision,questions,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM courses WHERE id=? AND version=?)',c.id,c.quiz_revision+1,JSON.stringify(updated),now(),c.id,c.version),statement('UPDATE courses SET quiz=?,quiz_revision=quiz_revision+1,version=version+1 WHERE id=? AND version=?',JSON.stringify(updated),c.id,c.version)]);
 }
 await run("INSERT OR IGNORE INTO settings VALUES('sample_links_v2','1')");
}
async function seed(u:any){
 if(await one('SELECT value FROM settings WHERE key=?','seed_v1'))return;
 const owner=await one('SELECT value FROM settings WHERE key=?','owner');
 if(owner?.value!==u.id)return;
 const s=[]; for(const c of seedCourses){
 s.push(statement('INSERT OR IGNORE INTO courses(id,owner_id,title,description,category,level,color,status,quiz,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',c.id,u.id,c.title,c.description,c.category,c.level,c.color,'PUBLISHED',JSON.stringify(sampleQuiz(c)),now()));
 c.lessons.forEach((l,n)=>s.push(statement('INSERT OR IGNORE INTO lessons(id,course_id,title,content,position,minutes) VALUES(?,?,?,?,?,?)',`${c.id}-${n+1}`,c.id,l.title,l.content,n+1,l.minutes)));
 }s.push(statement('INSERT OR IGNORE INTO settings VALUES(?,?)','seed_v1','1'));await db().batch(s);
}
async function course(id:string){const c=await one(`SELECT c.*,${legacySaleReview} sale_pending_review FROM courses c WHERE c.id=?`,id);if(!c)fail(404,'Không tìm thấy khóa học.');return c;}
const owns=(u:any,c:any)=>c.owner_id===u.id||u.role==='ADMIN';
const canEdit=(u:any,c:any)=>owns(u,c)&&c.status!=='PENDING_REVIEW'&&(c.status==='DRAFT'||u.role==='ADMIN');
function assertEditable(u:any,c:any){
 if(!owns(u,c))fail(403,'Bạn không có quyền sửa khóa học này.');
 if(!canEdit(u,c))fail(409,c.status==='PENDING_REVIEW'?'Hãy rút yêu cầu duyệt trước khi sửa.':'Bản đã duyệt cần quản trị viên chỉnh sửa.');
}
// Changes to a course's review state advance its version before editors can write again.
const editGuard="EXISTS(SELECT 1 FROM courses WHERE id=? AND version=?)";
async function access(u:any,c:any,needEnroll=true){
 if(owns(u,c))return;
 if(c.hidden||!['PUBLISHED','ARCHIVED'].includes(c.status))fail(403,'Khóa học hiện không khả dụng.');
 if((needEnroll||c.sale_pending_review)&&!await one('SELECT 1 FROM enrollments WHERE user_id=? AND course_id=?',u.id,c.id))fail(403,'Hãy ghi danh trước khi mở bài học.');
}
async function lesson(u:any,id:string,write=false){const l=await one('SELECT * FROM lessons WHERE id=?',id);if(!l)fail(404,'Không tìm thấy bài học.');const c=await course(l.course_id);if(write)assertEditable(u,c);else await access(u,c);return {l,c};}
function checkVersion(row:any,b:any){if(!Number.isInteger(b.version)||row.version!==b.version)fail(409,'Nội dung đã thay đổi. Hãy tải lại trước khi lưu.');}
async function state(u:any){
 const courses=await all(`SELECT c.id,c.price_vnd,c.owner_id,c.title,c.description,c.category,c.level,c.color,c.status,c.hidden,c.version,m.name as instructor,${legacySaleReview} sale_pending_review,
 (SELECT count(*) FROM lessons l WHERE l.course_id=c.id) as lesson_count,
 (SELECT coalesce(sum(minutes),0) FROM lessons l WHERE l.course_id=c.id) as minutes,
 (SELECT count(*) FROM completions x JOIN lessons l ON l.id=x.lesson_id WHERE x.user_id=? AND l.course_id=c.id AND l.required=1) as completed,
 (SELECT count(*) FROM lessons l WHERE l.course_id=c.id AND l.required=1) as required_count,
 (SELECT last_lesson_id FROM enrollments e WHERE e.course_id=c.id AND e.user_id=?) as last_lesson_id,
 (SELECT count(*) FROM enrollments e WHERE e.course_id=c.id) as students,
 EXISTS(SELECT 1 FROM enrollments e WHERE e.course_id=c.id AND e.user_id=?) as enrolled
 FROM courses c JOIN members m ON m.id=c.owner_id WHERE (c.status='PUBLISHED' AND c.hidden=0 AND NOT ${legacySaleReview}) OR c.owner_id=? OR ?='ADMIN' OR EXISTS(SELECT 1 FROM enrollments e WHERE e.course_id=c.id AND e.user_id=?) ORDER BY c.created_at,c.id`,u.id,u.id,u.id,u.id,u.role,u.id);
 return {user:u,wallet_balance:await accountWalletBalance(services(),u.id),courses:courses.map(c=>({...c,can_edit:canEdit(u,c)})),categories:await all('SELECT * FROM categories ORDER BY name'),notes:await all('SELECT n.*,l.title,c.title as course_title,c.id as course_id FROM notes n JOIN lessons l ON l.id=n.lesson_id JOIN courses c ON c.id=l.course_id WHERE n.user_id=? ORDER BY n.updated_at DESC',u.id),history:await all("SELECT * FROM (SELECT a.id,a.course_id,a.score,a.submitted_at,c.title,'default' kind FROM attempts a JOIN courses c ON c.id=a.course_id WHERE a.user_id=? AND a.status='SUBMITTED' UNION ALL SELECT a.id,a.course_id,a.score,a.submitted_at,c.title||' · '||q.title title,'named' kind FROM named_quiz_attempts a JOIN courses c ON c.id=a.course_id JOIN course_quizzes q ON q.id=a.quiz_id WHERE a.user_id=? AND a.status='SUBMITTED') ORDER BY submitted_at DESC LIMIT 30",u.id,u.id),activity:await all('SELECT x.created_at,l.minutes FROM completions x JOIN lessons l ON l.id=x.lesson_id WHERE x.user_id=? ORDER BY x.created_at DESC',u.id)};
}
async function detail(u:any,id:string){const c=await course(id);await access(u,c,false);const enrolled=!!await one('SELECT 1 FROM enrollments WHERE course_id=? AND user_id=?',id,u.id);const canRead=owns(u,c)||enrolled;
 const review=owns(u,c)?await one("SELECT kind,reason,created_at FROM course_review_events WHERE course_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1",c.id):undefined;
 const ls=await all('SELECT * FROM lessons WHERE course_id=? ORDER BY position',id);
 const done=await all('SELECT lesson_id FROM completions WHERE user_id=?',u.id);
 const n=canRead?await all('SELECT * FROM notes WHERE user_id=?',u.id):[];
 const fs=canRead?await all("SELECT m.id,m.lesson_id,m.name,m.size,m.mime,m.version FROM materials m JOIN lessons l ON l.id=m.lesson_id WHERE l.course_id=? AND m.status='READY'",id):[];
 return {...c,quiz:owns(u,c)?JSON.parse(c.quiz):undefined,quiz_count:JSON.parse(c.quiz).length,last_lesson_id:(await one('SELECT last_lesson_id FROM enrollments WHERE course_id=? AND user_id=?',id,u.id))?.last_lesson_id,enrolled,can_edit:canEdit(u,c),can_manage:owns(u,c),review,lessons:ls.map(l=>({...l,content:canRead?l.content:undefined,video_url:canRead?l.video_url:undefined,completed:done.some(d=>d.lesson_id===l.id),note:n.find(x=>x.lesson_id===l.id)?.body||'',materials:fs.filter(f=>f.lesson_id===l.id)}))};
}
async function attemptView(a:any,u:any){const q=JSON.parse(a.snapshot);return {...a,snapshot:undefined,questions:a.status==='SUBMITTED'?q:redact(q),answers:JSON.parse(a.answers),review_lessons:a.status==='SUBMITTED'?await recommendations(services(),u,a):[]};}
function services(){return {one,all,run,statement,db,course,lesson,owns,canEdit,assertEditable,editGuard,legacySaleReview,access,fail,json,str,checkVersion,log,now,uid,env};}
async function handler(req:Request){let requestLease:string|undefined;try{
 const path=new URL(req.url).pathname.replace(/^\/api\//,'').split('/');
 if(path[0]==='health'){if(path[1]!=='ready')return json({ok:true});const checks={database:false,storage:false};try{checks.database=!!await one('SELECT 1 ok');}catch{}try{await env.BUCKET!.head('__readiness_probe__');checks.storage=true;}catch{}return json({ok:checks.database&&checks.storage,checks},checks.database&&checks.storage?200:503);}
 const read=req.method==='GET';
 if(!read){if(req.headers.get('x-mo-hoc')!=='1')fail(403,'Thiếu xác nhận nguồn yêu cầu.');const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)fail(403,'Nguồn yêu cầu không hợp lệ.');}
 if(read&&path[0]==='catalog'){await initializeFeatures(services());return publicCatalog(services(),req);}
 if(read&&path[0]==='courses'&&path[1]&&!hasPasswordSession(req)&&!await getChatGPTUser()){
 const c=await course(path[1]);if(c.status!=='PUBLISHED'||c.hidden||c.sale_pending_review)fail(404,'Không tìm thấy khóa học.');
 return json({id:c.id,price_vnd:c.price_vnd,title:c.title,description:c.description,category:c.category,level:c.level,color:c.color,status:c.status,quiz_count:JSON.parse(c.quiz).length,enrolled:false,can_edit:false,lessons:await all('SELECT id,title,position,minutes,type,required FROM lessons WHERE course_id=? ORDER BY position',c.id)});
 }
 if(path[0]==='backup-restore'){if(await one("SELECT 1 FROM operation_leases WHERE key='restore' AND expires_at>?",now()))fail(503,'Dữ liệu đang được khôi phục.');}
 else{const key='request:'+uid();const lock=await run("INSERT INTO operation_leases(key,token,expires_at) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM operation_leases WHERE key='restore' AND expires_at>?)",key,key,new Date(Date.now()+5*60000).toISOString(),now());if(!lock.meta.changes)fail(503,'Dữ liệu đang được khôi phục. Vui lòng thử lại sau.');requestLease=key;}
 if(read){const publicResult=await advancedPublic(services(),req,path);if(publicResult)return publicResult;}
 const authResponse=await authPublic(services(),req,path);if(authResponse)return authResponse;
 const publicCommerce=await commercePublic(services(),req,path);if(publicCommerce)return publicCommerce;
 const u=await identity(req);await seed(u);await upgradeSampleQuiz(u);await initializeFeatures(services());
 if(read){const reminders=await reminderRead(services(),req,path,u);if(reminders)return reminders;const calendar=await calendarRead(services(),req,path,u);if(calendar)return calendar;}
 if(read){const tutorResult=await tutorRead(services(),req,path,u);if(tutorResult)return tutorResult;const authResult=await authRead(services(),path,u);if(authResult)return authResult;const socialResult=await socialRead(services(),req,path,u);if(socialResult)return socialResult;const commerceResult=await commerceRead(services(),req,path,u);if(commerceResult)return commerceResult;const labResponse=await labRead(services(),req,path,u);if(labResponse)return labResponse;const operations=await operationsRead(services(),req,path,u);if(operations)return operations;const advanced=await advancedRead(services(),req,path,u);if(advanced)return advanced;const learning=await learningRead(services(),req,path,u);if(learning)return learning;const extra=await featureRead(services(),req,path,u);if(extra)return extra;}
 if(read){const market=await marketplaceRead(services(),req,path,u);if(market)return market;}
 if(read&&path[0]==='state')return json(await state(u));
 if(read&&path[0]==='courses'&&path[1])return json(await detail(u,path[1]));
 if(read&&path[0]==='admin'){
 if(u.role!=='ADMIN')fail(403,'Chỉ quản trị viên có quyền truy cập.');
 return json({members:await all("SELECT id,name,email,CASE WHEN role='ADMIN' THEN 'ADMIN' ELSE 'LEARNER' END role,blocked,is_mentor,version,created_at FROM members ORDER BY created_at DESC LIMIT 20"),audit:await all('SELECT a.*,m.name FROM audit a LEFT JOIN members m ON m.id=a.actor_id ORDER BY a.created_at DESC LIMIT 50'),stats:await one("SELECT (SELECT count(*) FROM members) users,(SELECT count(*) FROM enrollments) enrollments,((SELECT count(*) FROM attempts WHERE status='SUBMITTED')+(SELECT count(*) FROM named_quiz_attempts WHERE status='SUBMITTED')) quizzes")});}
 if(read&&path[0]==='attempts'&&path[1]){const a=await one('SELECT * FROM attempts WHERE id=? AND user_id=?',path[1],u.id);if(!a)fail(404,'Không tìm thấy lượt làm bài.');if(a.status!=='SUBMITTED')await access(u,await course(a.course_id));return json(await attemptView(a,u));}
 if(read&&path[0]==='files'&&path[1]){const f=await one("SELECT * FROM materials WHERE id=? AND status='READY'",path[1]);if(!f)fail(404,'Không tìm thấy tài liệu.');await lesson(u,f.lesson_id);const obj=await env.BUCKET!.get(f.object_key);if(!obj)fail(404,'Tệp không còn khả dụng.');return new Response(obj!.body,{headers:{'Content-Type':f.mime,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
 if(read)fail(404,'Đường dẫn không tồn tại.');
 if(path[0]==='backup-import')return await portableBackupImport(services(),req,u);
 if(path[0]==='community-upload')return await socialUpload(services(),req,u);
 if(path[0]==='upload'){
 const length=Number(req.headers.get('content-length')||0);if(length>11*1024*1024)fail(413,'Tệp quá lớn.');
 const form=await req.formData();const id=str(form.get('lesson_id'));const {c}=await lesson(u,id,true);const f=form.get('file');if(!(f instanceof File))fail(422,'Hãy chọn một tệp.');if(f.size>10*1024*1024)fail(413,'Tối đa 10 MB mỗi tệp.');
 const bytes=new Uint8Array(await f.arrayBuffer());const mime=fileKind(bytes);if(!mime)fail(422,'Chỉ hỗ trợ PDF, PNG hoặc JPEG đúng định dạng.');if(mime!=='application/pdf'&&f.size>5*1024*1024)fail(413,'Ảnh tối đa 5 MB.');
 const ext=f.name.toLowerCase().split('.').pop();if(!(mime==='application/pdf'?ext==='pdf':mime==='image/png'?ext==='png':['jpg','jpeg'].includes(ext||'')))fail(422,'Phần mở rộng không khớp với nội dung tệp.');
 const fileId=uid(),key=`materials/${fileId}`;await env.BUCKET!.put(key,bytes,{httpMetadata:{contentType:mime}});
 try{const saved=await run('INSERT INTO materials(id,lesson_id,object_key,name,mime,size,created_at) SELECT ?,?,?,?,?,?,? WHERE '+editGuard+' AND EXISTS(SELECT 1 FROM lessons WHERE id=? AND course_id=?)',fileId,id,key,f.name.slice(0,255),mime,f.size,now(),c.id,c.version,id,c.id);if(!saved.meta.changes)fail(409,'Bài học hoặc khóa học vừa thay đổi.');}catch(e){await env.BUCKET!.delete(key);throw e;}return json({id:fileId},201);}
 if(Number(req.headers.get('content-length')||0)>524288)fail(413,'Yêu cầu quá lớn.');
 const raw=await req.text();if(raw.length>524288)fail(413,'Yêu cầu quá lớn.');let b:any;try{b=JSON.parse(raw||'{}');}catch{fail(400,'Dữ liệu JSON không hợp lệ.');}
 if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'Dữ liệu phải là một đối tượng JSON.');
 if(!['backup-restore','operations-run','backup-preview'].includes(path[0])&&await one("SELECT 1 FROM operation_leases WHERE key='restore' AND expires_at>?",now()))fail(503,'Dữ liệu đang được khôi phục. Vui lòng thử lại sau.');
 const tutorResult=await tutorWrite(services(),path,u,b);if(tutorResult)return tutorResult;
 const authResult=await authWrite(services(),path,u,b);if(authResult)return authResult;
 const reminderResult=await reminderWrite(services(),path,u,b);if(reminderResult)return reminderResult;
 const socialResult=await socialWrite(services(),path,u,b);if(socialResult)return socialResult;
 const market=await marketplaceWrite(services(),path,u,b);if(market)return market;
 const commerceResult=await commerceWrite(services(),path,u,b);if(commerceResult)return commerceResult;
 const operations=await operationsWrite(services(),path,u,b);if(operations)return operations;
 const labResponse=await labWrite(services(),path,u,b);if(labResponse)return labResponse;
 const advanced=await advancedWrite(services(),path,u,b);if(advanced)return advanced;
 const learning=await learningWrite(services(),path,u,b);if(learning)return learning;const extra=await featureWrite(services(),path,u,b);if(extra)return extra;
 if(path[0]==='profile'){const name=str(b.name,2,80);const bio=b.bio===undefined?u.bio:str(b.bio,0,500);const goal=Number(b.goal);if(!Number.isInteger(goal)||goal<1||goal>30)fail(422,'Mục tiêu từ 1 đến 30 bài mỗi tuần.');await run('UPDATE members SET name=?,goal=?,bio=?,version=version+1 WHERE id=?',name,goal,bio,u.id);return json({ok:true});}
 if(path[0]==='complete'){
 const {l}=await lesson(u,str(b.lesson_id));if(!await one('SELECT 1 FROM enrollments WHERE user_id=? AND course_id=?',u.id,l.course_id))fail(403,'Hãy ghi danh trước khi lưu tiến độ.');await db().batch([statement('INSERT OR IGNORE INTO completions VALUES(?,?,?)',u.id,l.id,now()),statement(`UPDATE enrollments SET completed_at=coalesce(completed_at,?) WHERE user_id=? AND course_id=? AND EXISTS(SELECT 1 FROM lessons WHERE course_id=? AND required=1) AND NOT EXISTS(SELECT 1 FROM lessons l WHERE l.course_id=? AND l.required=1 AND NOT EXISTS(SELECT 1 FROM completions x WHERE x.lesson_id=l.id AND x.user_id=?))`,now(),u.id,l.course_id,l.course_id,l.course_id,u.id)]);return json({ok:true});}
 if(path[0]==='notes'){const {l}=await lesson(u,str(b.lesson_id));const body=str(b.body,0,5000);if(body)await run('INSERT INTO notes VALUES(?,?,?,?) ON CONFLICT(user_id,lesson_id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at',u.id,l.id,body,now());else await run('DELETE FROM notes WHERE user_id=? AND lesson_id=?',u.id,l.id);return json({ok:true});}
 if(path[0]==='quiz-start'){
 const c=await course(str(b.course_id));await access(u,c);if(!await one('SELECT 1 FROM enrollments WHERE user_id=? AND course_id=?',u.id,c.id))fail(403,'Hãy ghi danh để làm quiz.');const q=JSON.parse(c.quiz);if(!q.length)fail(422,'Khóa học chưa có quiz.');
 let existing=await one('SELECT a.* FROM active_attempts x JOIN attempts a ON a.id=x.attempt_id WHERE x.user_id=? AND x.course_id=?',u.id,c.id);
 if(existing&&existing.status==='IN_PROGRESS'&&existing.expires_at>now())return json(await attemptView(existing,u));
 if(existing)await db().batch([statement("UPDATE attempts SET status='EXPIRED' WHERE id=? AND status='IN_PROGRESS'",existing.id),statement('DELETE FROM active_attempts WHERE attempt_id=?',existing.id)]);
 const recent=await one('SELECT count(*) n FROM attempts WHERE user_id=? AND course_id=? AND created_at>?',u.id,c.id,new Date(Date.now()-3600000).toISOString());if(recent.n>=10)fail(429,'Bạn đã tạo 10 lượt trong một giờ. Hãy nghỉ một chút rồi thử lại.');
 await run('INSERT OR IGNORE INTO quiz_revisions(course_id,revision,questions,created_at) VALUES(?,?,?,?)',c.id,c.quiz_revision,c.quiz,now());
 const id=uid();await db().batch([statement('INSERT INTO attempts(id,user_id,course_id,snapshot,created_at,expires_at) VALUES(?,?,?,?,?,?)',id,u.id,c.id,c.quiz,now(),new Date(Date.now()+86400000).toISOString()),statement('INSERT OR IGNORE INTO active_attempts VALUES(?,?,?)',u.id,c.id,id)]);
 existing=await one('SELECT a.* FROM active_attempts x JOIN attempts a ON a.id=x.attempt_id WHERE x.user_id=? AND x.course_id=?',u.id,c.id);return json(await attemptView(existing,u),201);}
 if(path[0]==='quiz-answers'){
 const a=await one('SELECT * FROM attempts WHERE id=? AND user_id=?',str(b.attempt_id),u.id);if(!a)fail(404,'Không tìm thấy lượt làm bài.');await access(u,await course(a.course_id));if(a.status!=='IN_PROGRESS'||a.expires_at<=now())fail(409,'Lượt làm bài đã nộp hoặc hết hạn.');checkVersion(a,b);const q=JSON.parse(a.snapshot);if(!validAnswers(q,b.answers))fail(422,'Đáp án không thuộc đề bài.');const r=await run("UPDATE attempts SET answers=?,version=version+1 WHERE id=? AND version=? AND status='IN_PROGRESS'",JSON.stringify(b.answers),a.id,a.version);if(!r.meta.changes)fail(409,'Đáp án đã thay đổi. Hãy mở lại quiz để lấy bản mới nhất.');return json(await attemptView(await one('SELECT * FROM attempts WHERE id=?',a.id),u));}
 if(path[0]==='quiz-submit'){
 const a=await one('SELECT * FROM attempts WHERE id=? AND user_id=?',str(b.attempt_id),u.id);if(!a)fail(404,'Không tìm thấy lượt làm bài.');if(a.status==='SUBMITTED')return json(await attemptView(a,u));await access(u,await course(a.course_id));if(a.status!=='IN_PROGRESS'||a.expires_at<=now())fail(409,'Lượt làm bài đã hết hạn. Hãy bắt đầu lượt mới.');
 checkVersion(a,b);const q:Question[]=JSON.parse(a.snapshot);if(b.answers!==undefined&&!validAnswers(q,b.answers))fail(422,'Đáp án không thuộc đề bài.');const submittedAnswers=JSON.parse(a.answers);
 const result=await run("UPDATE attempts SET answers=?,score=?,status='SUBMITTED',submitted_at=?,version=version+1 WHERE id=? AND version=? AND status='IN_PROGRESS'",JSON.stringify(submittedAnswers),grade(q,submittedAnswers),now(),a.id,a.version);
 if(!result.meta.changes){const current=await one('SELECT * FROM attempts WHERE id=?',a.id);if(current.status==='SUBMITTED')return json(await attemptView(current,u));fail(409,'Lượt làm bài đã thay đổi.');}
 await run('DELETE FROM active_attempts WHERE attempt_id=?',a.id);return json(await attemptView(await one('SELECT * FROM attempts WHERE id=?',a.id),u));}
 if(path[0]==='course-save'){
 const title=str(b.title,3,150),description=str(b.description,10,2000);if(!await one('SELECT 1 FROM categories WHERE name=? AND (active=1 OR EXISTS(SELECT 1 FROM courses WHERE id=? AND category=categories.name))',str(b.category,2,80),typeof b.id==='string'?b.id:'')||!['Nhập môn','Cơ bản','Trung cấp'].includes(b.level))fail(422,'Danh mục hoặc cấp độ không hợp lệ.');
 if(b.id){const c=await course(b.id);assertEditable(u,c);checkVersion(c,b);const r=await run('UPDATE courses SET title=?,description=?,category=?,level=?,version=version+1 WHERE id=? AND version=?',title,description,b.category,b.level,c.id,b.version);if(!r.meta.changes)fail(409,'Nội dung đã thay đổi.');return json({id:c.id});}
 const id=uid();await run('INSERT INTO courses(id,owner_id,title,description,category,level,color,created_at) VALUES(?,?,?,?,?,?,?,?)',id,u.id,title,description,b.category,b.level,'mint',now());await log(u,'Tạo khóa học',id);return json({id},201);}
 if(path[0]==='lesson-save'){
 const c=await course(str(b.course_id));assertEditable(u,c);const title=str(b.title,1,150),type=b.type||'TEXT',content=str(b.content||'',type==='VIDEO_LINK'?0:20,100000);if(!['TEXT','VIDEO_LINK'].includes(type))fail(422,'Loại bài không hợp lệ.');const video=type==='VIDEO_LINK'?videoSource(b.video_url):null;if(type==='VIDEO_LINK'&&!video)fail(422,'Video phải là một URL HTTPS hợp lệ.');const required=b.required===false?0:1;const minutes=Number(b.minutes);if(!Number.isInteger(minutes)||minutes<1||minutes>180)fail(422,'Thời lượng từ 1 đến 180 phút.');
 if(b.id){const {l}=await lesson(u,b.id,true);if(l.course_id!==c.id)fail(422,'Bài không thuộc khóa học.');checkVersion(l,b);if(c.status!=='DRAFT'&&l.required!==required)fail(409,'Không đổi yêu cầu bắt buộc sau xuất bản.');const r=await run("UPDATE lessons SET title=?,content=?,minutes=?,type=?,video_url=?,required=?,version=version+1 WHERE id=? AND version=? AND "+editGuard,title,content,minutes,type,video?.url||null,required,l.id,b.version,c.id,c.version);if(!r.meta.changes)fail(409,'Nội dung đã thay đổi.');return json({id:l.id});}
 const id=uid();const results=await db().batch([statement("INSERT INTO lessons(id,course_id,title,content,position,minutes,type,video_url,required) SELECT ?,?,?,?,coalesce((SELECT max(position) FROM lessons WHERE course_id=?),0)+1,?,?,?,? WHERE EXISTS(SELECT 1 FROM courses WHERE id=? AND status='DRAFT' AND version=?)",id,c.id,title,content,c.id,minutes,type,video?.url||null,required,c.id,c.version),statement("UPDATE courses SET version=version+1 WHERE id=? AND status='DRAFT' AND version=?",c.id,c.version)]);if(!results[1].meta.changes)fail(409,'Bản nháp đã thay đổi hoặc đã xuất bản.');return json({id},201);}
 if(path[0]==='quiz-save'){
 const c=await course(str(b.course_id));assertEditable(u,c);checkVersion(c,b);if(!validQuiz(b.questions))fail(422,'Mỗi câu cần nội dung, 2–6 lựa chọn và một đáp án đúng.');for(const q of b.questions){if(await one('SELECT 1 FROM question_bank WHERE course_id=? AND id=? AND archived=1',c.id,q.id))fail(422,'Không dùng câu hỏi đã lưu trữ trong phiên bản quiz mới.');if(q.lesson_id&&!await one('SELECT 1 FROM lessons WHERE id=? AND course_id=?',q.lesson_id,c.id))fail(422,'Câu hỏi liên kết tới bài ngoài khóa học.');}
 const clean=b.questions.map((q:any)=>({id:q.id,prompt:q.prompt,options:q.options,correct:q.correct,explanation:q.explanation,lesson_id:q.lesson_id||null}));
 const results=await db().batch([statement('INSERT OR IGNORE INTO quiz_revisions(course_id,revision,questions,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM courses WHERE id=? AND version=?)',c.id,c.quiz_revision,c.quiz,now(),c.id,b.version),statement('INSERT OR IGNORE INTO quiz_revisions(course_id,revision,questions,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM courses WHERE id=? AND version=?)',c.id,c.quiz_revision+1,JSON.stringify(clean),now(),c.id,b.version),statement('UPDATE courses SET quiz=?,quiz_revision=quiz_revision+1,version=version+1 WHERE id=? AND version=?',JSON.stringify(clean),c.id,b.version)]);if(!results[2].meta.changes)fail(409,'Nội dung đã thay đổi.');return json({ok:true});}
 if(path[0]==='file-delete'){
 const f=await one('SELECT * FROM materials WHERE id=?',str(b.id));if(!f)fail(404,'Tệp không tồn tại.');const {c}=await lesson(u,f.lesson_id,true);checkVersion(f,b);if(f.status!=='READY')fail(409,'Tệp đã được gỡ.');const r=await run("UPDATE materials SET status='DETACHED',detached_at=?,version=version+1 WHERE id=? AND version=? AND status='READY' AND "+editGuard,now(),f.id,b.version,c.id,c.version);if(!r.meta.changes)fail(409,'Trạng thái tệp đã thay đổi.');await log(u,'Gỡ học liệu',f.id);return json({ok:true});}
 if(path[0]==='moderate'){
 if(u.role!=='ADMIN')fail(403,'Chỉ quản trị viên có quyền.');const reason=str(b.reason,5,1000);const c=await course(str(b.course_id));checkVersion(c,b);const r=await run('UPDATE courses SET hidden=?,version=version+1 WHERE id=? AND version=?',b.hidden?1:0,c.id,b.version);if(!r.meta.changes)fail(409,'Nội dung đã thay đổi.');await log(u,b.hidden?'Ẩn khóa học':'Hiện khóa học',c.id,reason);return json({ok:true});}
 if(path[0]==='member-update'){
 if(u.role!=='ADMIN')fail(403,'Chỉ quản trị viên có quyền.');const reason=str(b.reason,5,1000);const member=await one('SELECT * FROM members WHERE id=?',str(b.id));if(!member)fail(404,'Tài khoản không tồn tại.');if(member.role==='ADMIN')fail(403,'Không thay đổi tài khoản quản trị tại đây.');if(b.role!=='LEARNER')fail(422,'Vai trò không hợp lệ.');await run('UPDATE members SET role=?,blocked=?,version=version+1 WHERE id=?',b.role,b.blocked?1:0,member.id);await log(u,'Cập nhật quyền / trạng thái',member.id,reason);return json({ok:true});}
 fail(404,'Đường dẫn không tồn tại.');
 }catch(e){if(e instanceof Failure)return json({error:e.message},e.status);if(e instanceof Error&&e.name==='PasswordBusy')return json({error:e.message},503);console.error('API request failed',e instanceof Error?e.message:'unknown');return json({error:'Chưa thể hoàn tất. Vui lòng thử lại sau.'},500);}finally{if(requestLease)try{await run('DELETE FROM operation_leases WHERE key=?',requestLease);}catch{console.error('Request lease cleanup failed');}}}
export const GET=handler;export const POST=handler;
