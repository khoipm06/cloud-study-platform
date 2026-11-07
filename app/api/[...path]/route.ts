import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import {seedCourses} from '../../../lib/seed';
import {grade,redact,validQuiz,validAnswers,fileKind, type Question} from '../../../lib/rules';
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
const editor=(u:any)=>u.role==='ADMIN'||u.role==='INSTRUCTOR';
async function log(u:any,action:string,resource:string){await run('INSERT INTO audit VALUES(?,?,?,?,?)',uid(),u.id,action,resource,now());}
async function identity(){
 const i=await getChatGPTUser(); if(!i)fail(401,'Đăng nhập để lưu hành trình học của bạn.');
 // Bootstrap occurs behind the private Site access boundary. Subsequent users are learners.
 await run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)','owner',i!.userId);
 const owner=await one('SELECT value FROM settings WHERE key=?','owner');
 await run('INSERT OR IGNORE INTO members(id,name,email,role,created_at) VALUES(?,?,?,?,?)',i!.userId,i!.displayName,i!.email,owner.value===i!.userId?'ADMIN':'LEARNER',now());
 const u=await one('SELECT * FROM members WHERE id=?',i!.userId);if(u.blocked)fail(403,'Tài khoản đã bị tạm khóa.');return u;
}
async function seed(u:any){
 if(await one('SELECT value FROM settings WHERE key=?','seed_v1'))return;
 const owner=await one('SELECT value FROM settings WHERE key=?','owner');
 if(owner.value!==u.id)return;
 const s=[]; for(const c of seedCourses){
 s.push(statement('INSERT OR IGNORE INTO courses(id,owner_id,title,description,category,level,color,status,quiz,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',c.id,u.id,c.title,c.description,c.category,c.level,c.color,'PUBLISHED',JSON.stringify(c.quiz),now()));
 c.lessons.forEach((l,n)=>s.push(statement('INSERT OR IGNORE INTO lessons(id,course_id,title,content,position,minutes) VALUES(?,?,?,?,?,?)',`${c.id}-${n+1}`,c.id,l.title,l.content,n+1,l.minutes)));
 }s.push(statement('INSERT OR IGNORE INTO settings VALUES(?,?)','seed_v1','1'));await db().batch(s);
}
async function course(id:string){const c=await one('SELECT * FROM courses WHERE id=?',id);if(!c)fail(404,'Không tìm thấy khóa học.');return c;}
const owns=(u:any,c:any)=>editor(u)&&(c.owner_id===u.id||u.role==='ADMIN');
async function access(u:any,c:any,needEnroll=true){
 if(owns(u,c))return;
 if(c.hidden||c.status==='DRAFT')fail(403,'Khóa học hiện không khả dụng.');
 if(needEnroll&&!await one('SELECT 1 FROM enrollments WHERE user_id=? AND course_id=?',u.id,c.id))fail(403,'Hãy ghi danh trước khi mở bài học.');
}
async function lesson(u:any,id:string,write=false){const l=await one('SELECT * FROM lessons WHERE id=?',id);if(!l)fail(404,'Không tìm thấy bài học.');const c=await course(l.course_id);if(write){if(!owns(u,c))fail(403,'Bạn không có quyền sửa khóa học này.');}else await access(u,c);return {l,c};}
function checkVersion(row:any,b:any){if(!Number.isInteger(b.version)||row.version!==b.version)fail(409,'Nội dung đã thay đổi. Hãy tải lại trước khi lưu.');}
async function state(u:any){
 const courses=await all(`SELECT c.id,c.owner_id,c.title,c.description,c.category,c.level,c.color,c.status,c.hidden,c.version,m.name as instructor,
 (SELECT count(*) FROM lessons l WHERE l.course_id=c.id) as lesson_count,
 (SELECT coalesce(sum(minutes),0) FROM lessons l WHERE l.course_id=c.id) as minutes,
 (SELECT count(*) FROM completions x JOIN lessons l ON l.id=x.lesson_id WHERE x.user_id=? AND l.course_id=c.id) as completed,
 (SELECT count(*) FROM enrollments e WHERE e.course_id=c.id) as students,
 EXISTS(SELECT 1 FROM enrollments e WHERE e.course_id=c.id AND e.user_id=?) as enrolled
 FROM courses c JOIN members m ON m.id=c.owner_id WHERE (c.status='PUBLISHED' AND c.hidden=0) OR c.owner_id=? OR ?='ADMIN' OR EXISTS(SELECT 1 FROM enrollments e WHERE e.course_id=c.id AND e.user_id=?) ORDER BY c.created_at,c.id`,u.id,u.id,u.id,u.role,u.id);
 return {user:u,courses,notes:await all('SELECT n.*,l.title,c.title as course_title,c.id as course_id FROM notes n JOIN lessons l ON l.id=n.lesson_id JOIN courses c ON c.id=l.course_id WHERE n.user_id=? ORDER BY n.updated_at DESC',u.id),history:await all("SELECT a.id,a.course_id,a.score,a.submitted_at,c.title FROM attempts a JOIN courses c ON c.id=a.course_id WHERE a.user_id=? AND a.status='SUBMITTED' ORDER BY a.submitted_at DESC LIMIT 30",u.id),activity:await all('SELECT x.created_at,l.minutes FROM completions x JOIN lessons l ON l.id=x.lesson_id WHERE x.user_id=? ORDER BY x.created_at DESC',u.id)};
}
async function detail(u:any,id:string){const c=await course(id);await access(u,c,false);const enrolled=!!await one('SELECT 1 FROM enrollments WHERE course_id=? AND user_id=?',id,u.id);const canRead=owns(u,c)||enrolled;
 const ls=await all('SELECT * FROM lessons WHERE course_id=? ORDER BY position',id);
 const done=await all('SELECT lesson_id FROM completions WHERE user_id=?',u.id);
 const n=canRead?await all('SELECT * FROM notes WHERE user_id=?',u.id):[];
 const fs=canRead?await all('SELECT m.id,m.lesson_id,m.name,m.size,m.mime FROM materials m JOIN lessons l ON l.id=m.lesson_id WHERE l.course_id=?',id):[];
 return {...c,quiz:owns(u,c)?JSON.parse(c.quiz):undefined,quiz_count:JSON.parse(c.quiz).length,enrolled,can_edit:owns(u,c),lessons:ls.map(l=>({...l,content:canRead?l.content:undefined,completed:done.some(d=>d.lesson_id===l.id),note:n.find(x=>x.lesson_id===l.id)?.body||'',materials:fs.filter(f=>f.lesson_id===l.id)}))};
}
function attemptView(a:any){const q=JSON.parse(a.snapshot);return {...a,snapshot:undefined,questions:a.status==='SUBMITTED'?q:redact(q),answers:JSON.parse(a.answers)};}
async function handler(req:Request){try{
 const path=new URL(req.url).pathname.replace(/^\/api\//,'').split('/');
 if(path[0]==='health')return json({ok:true});
 const read=req.method==='GET';
 if(!read){if(req.headers.get('x-mo-hoc')!=='1')fail(403,'Thiếu xác nhận nguồn yêu cầu.');const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)fail(403,'Nguồn yêu cầu không hợp lệ.');}
 const u=await identity();await seed(u);
 if(read&&path[0]==='state')return json(await state(u));
 if(read&&path[0]==='courses'&&path[1])return json(await detail(u,path[1]));
 if(read&&path[0]==='admin'){
 if(u.role!=='ADMIN')fail(403,'Chỉ quản trị viên có quyền truy cập.');
 return json({members:await all('SELECT id,name,email,role,blocked,created_at FROM members ORDER BY created_at DESC'),audit:await all('SELECT a.*,m.name FROM audit a LEFT JOIN members m ON m.id=a.actor_id ORDER BY a.created_at DESC LIMIT 50'),stats:await one("SELECT (SELECT count(*) FROM members) users,(SELECT count(*) FROM enrollments) enrollments,(SELECT count(*) FROM attempts WHERE status='SUBMITTED') quizzes")});}
 if(read&&path[0]==='attempts'&&path[1]){const a=await one('SELECT * FROM attempts WHERE id=? AND user_id=?',path[1],u.id);if(!a)fail(404,'Không tìm thấy lượt làm bài.');if(a.status!=='SUBMITTED')await access(u,await course(a.course_id));return json(attemptView(a));}
 if(read&&path[0]==='files'&&path[1]){const f=await one('SELECT * FROM materials WHERE id=?',path[1]);if(!f)fail(404,'Không tìm thấy tài liệu.');await lesson(u,f.lesson_id);const obj=await env.BUCKET!.get(f.object_key);if(!obj)fail(404,'Tệp không còn khả dụng.');return new Response(obj!.body,{headers:{'Content-Type':f.mime,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
 if(read)fail(404,'Đường dẫn không tồn tại.');
 if(path[0]==='upload'){
 const length=Number(req.headers.get('content-length')||0);if(length>11*1024*1024)fail(413,'Tệp quá lớn.');
 const form=await req.formData();const id=str(form.get('lesson_id'));await lesson(u,id,true);const f=form.get('file');if(!(f instanceof File))fail(422,'Hãy chọn một tệp.');if(f.size>10*1024*1024)fail(413,'Tối đa 10 MB mỗi tệp.');
 const bytes=new Uint8Array(await f.arrayBuffer());const mime=fileKind(bytes);if(!mime)fail(422,'Chỉ hỗ trợ PDF, PNG hoặc JPEG đúng định dạng.');if(mime!=='application/pdf'&&f.size>5*1024*1024)fail(413,'Ảnh tối đa 5 MB.');
 const fileId=uid(),key=`materials/${fileId}`;await env.BUCKET!.put(key,bytes,{httpMetadata:{contentType:mime}});
 try{await run('INSERT INTO materials VALUES(?,?,?,?,?,?,?)',fileId,id,key,f.name.slice(0,255),mime,f.size,now());}catch(e){await env.BUCKET!.delete(key);throw e;}return json({id:fileId},201);}
 if(Number(req.headers.get('content-length')||0)>524288)fail(413,'Yêu cầu quá lớn.');
 const raw=await req.text();if(raw.length>524288)fail(413,'Yêu cầu quá lớn.');let b:any;try{b=JSON.parse(raw||'{}');}catch{fail(400,'Dữ liệu JSON không hợp lệ.');}
 if(path[0]==='profile'){const name=str(b.name,1,80);const goal=Number(b.goal);if(!Number.isInteger(goal)||goal<1||goal>30)fail(422,'Mục tiêu từ 1 đến 30 bài mỗi tuần.');await run('UPDATE members SET name=?,goal=? WHERE id=?',name,goal,u.id);return json({ok:true});}
 if(path[0]==='enroll'){
 const c=await course(str(b.course_id));if(c.hidden||c.status!=='PUBLISHED')fail(403,'Khóa học chưa mở ghi danh.');await run('INSERT OR IGNORE INTO enrollments VALUES(?,?,?)',u.id,c.id,now());return json({ok:true});}
 if(path[0]==='complete'){
 const {l}=await lesson(u,str(b.lesson_id));if(!await one('SELECT 1 FROM enrollments WHERE user_id=? AND course_id=?',u.id,l.course_id))fail(403,'Hãy ghi danh trước khi lưu tiến độ.');await run('INSERT OR IGNORE INTO completions VALUES(?,?,?)',u.id,l.id,now());return json({ok:true});}
 if(path[0]==='notes'){const {l}=await lesson(u,str(b.lesson_id));const body=str(b.body,0,5000);if(body)await run('INSERT INTO notes VALUES(?,?,?,?) ON CONFLICT(user_id,lesson_id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at',u.id,l.id,body,now());else await run('DELETE FROM notes WHERE user_id=? AND lesson_id=?',u.id,l.id);return json({ok:true});}
 if(path[0]==='quiz-start'){
 const c=await course(str(b.course_id));await access(u,c);if(!await one('SELECT 1 FROM enrollments WHERE user_id=? AND course_id=?',u.id,c.id))fail(403,'Hãy ghi danh để làm quiz.');const q=JSON.parse(c.quiz);if(!q.length)fail(422,'Khóa học chưa có quiz.');
 let existing=await one('SELECT a.* FROM active_attempts x JOIN attempts a ON a.id=x.attempt_id WHERE x.user_id=? AND x.course_id=?',u.id,c.id);
 if(existing&&existing.status==='IN_PROGRESS'&&existing.expires_at>now())return json(attemptView(existing));
 if(existing)await db().batch([statement("UPDATE attempts SET status='EXPIRED' WHERE id=? AND status='IN_PROGRESS'",existing.id),statement('DELETE FROM active_attempts WHERE attempt_id=?',existing.id)]);
 const recent=await one('SELECT count(*) n FROM attempts WHERE user_id=? AND course_id=? AND created_at>?',u.id,c.id,new Date(Date.now()-3600000).toISOString());if(recent.n>=10)fail(429,'Bạn đã tạo 10 lượt trong một giờ. Hãy nghỉ một chút rồi thử lại.');
 const id=uid();await db().batch([statement('INSERT INTO attempts(id,user_id,course_id,snapshot,created_at,expires_at) VALUES(?,?,?,?,?,?)',id,u.id,c.id,c.quiz,now(),new Date(Date.now()+86400000).toISOString()),statement('INSERT OR IGNORE INTO active_attempts VALUES(?,?,?)',u.id,c.id,id)]);
 existing=await one('SELECT a.* FROM active_attempts x JOIN attempts a ON a.id=x.attempt_id WHERE x.user_id=? AND x.course_id=?',u.id,c.id);return json(attemptView(existing),201);}
 if(path[0]==='quiz-answers'){
 const a=await one('SELECT * FROM attempts WHERE id=? AND user_id=?',str(b.attempt_id),u.id);if(!a)fail(404,'Không tìm thấy lượt làm bài.');await access(u,await course(a.course_id));if(a.status!=='IN_PROGRESS'||a.expires_at<=now())fail(409,'Lượt làm bài đã nộp hoặc hết hạn.');checkVersion(a,b);const q=JSON.parse(a.snapshot);if(!validAnswers(q,b.answers))fail(422,'Đáp án không thuộc đề bài.');const r=await run("UPDATE attempts SET answers=?,version=version+1 WHERE id=? AND version=? AND status='IN_PROGRESS'",JSON.stringify(b.answers),a.id,a.version);if(!r.meta.changes)fail(409,'Đáp án đã thay đổi. Hãy mở lại quiz để lấy bản mới nhất.');return json(attemptView(await one('SELECT * FROM attempts WHERE id=?',a.id)));}
 if(path[0]==='quiz-submit'){
 const a=await one('SELECT * FROM attempts WHERE id=? AND user_id=?',str(b.attempt_id),u.id);if(!a)fail(404,'Không tìm thấy lượt làm bài.');if(a.status==='SUBMITTED')return json(attemptView(a));await access(u,await course(a.course_id));if(a.status!=='IN_PROGRESS'||a.expires_at<=now())fail(409,'Lượt làm bài đã hết hạn. Hãy bắt đầu lượt mới.');
 checkVersion(a,b);const q:Question[]=JSON.parse(a.snapshot);if(!validAnswers(q,b.answers))fail(422,'Đáp án không thuộc đề bài.');
 const result=await run("UPDATE attempts SET answers=?,score=?,status='SUBMITTED',submitted_at=?,version=version+1 WHERE id=? AND version=? AND status='IN_PROGRESS'",JSON.stringify(b.answers),grade(q,b.answers),now(),a.id,a.version);
 if(!result.meta.changes){const current=await one('SELECT * FROM attempts WHERE id=?',a.id);if(current.status==='SUBMITTED')return json(attemptView(current));fail(409,'Lượt làm bài đã thay đổi.');}
 await run('DELETE FROM active_attempts WHERE attempt_id=?',a.id);return json(attemptView(await one('SELECT * FROM attempts WHERE id=?',a.id)));}
 if(path[0]==='course-save'){
 if(!editor(u))fail(403,'Bạn cần quyền giảng viên.');const title=str(b.title,3,150),description=str(b.description,10,2000);if(!['Công nghệ','Thiết kế','Kỹ năng'].includes(b.category)||!['Nhập môn','Cơ bản','Trung cấp'].includes(b.level))fail(422,'Danh mục hoặc cấp độ không hợp lệ.');
 if(b.id){const c=await course(b.id);if(!owns(u,c))fail(403,'Không có quyền sửa.');checkVersion(c,b);const r=await run('UPDATE courses SET title=?,description=?,category=?,level=?,version=version+1 WHERE id=? AND version=?',title,description,b.category,b.level,c.id,b.version);if(!r.meta.changes)fail(409,'Nội dung đã thay đổi.');return json({id:c.id});}
 const id=uid();await run('INSERT INTO courses(id,owner_id,title,description,category,level,color,created_at) VALUES(?,?,?,?,?,?,?,?)',id,u.id,title,description,b.category,b.level,'mint',now());await log(u,'Tạo khóa học',id);return json({id},201);}
 if(path[0]==='lesson-save'){
 const c=await course(str(b.course_id));if(!owns(u,c))fail(403,'Không có quyền sửa.');const title=str(b.title,3,150),content=str(b.content,20,30000);const minutes=Number(b.minutes);if(!Number.isInteger(minutes)||minutes<1||minutes>180)fail(422,'Thời lượng từ 1 đến 180 phút.');
 if(b.id){const {l}=await lesson(u,b.id,true);if(l.course_id!==c.id)fail(422,'Bài không thuộc khóa học.');checkVersion(l,b);const r=await run('UPDATE lessons SET title=?,content=?,minutes=?,version=version+1 WHERE id=? AND version=?',title,content,minutes,l.id,b.version);if(!r.meta.changes)fail(409,'Nội dung đã thay đổi.');return json({id:l.id});}
 const id=uid();const r=await run("INSERT INTO lessons(id,course_id,title,content,position,minutes) SELECT ?,?,?,?,coalesce((SELECT max(position) FROM lessons WHERE course_id=?),0)+1,? WHERE EXISTS(SELECT 1 FROM courses WHERE id=? AND status='DRAFT')",id,c.id,title,content,c.id,minutes,c.id);if(!r.meta.changes)fail(409,'Chỉ thêm bài khi khóa còn là bản nháp.');return json({id},201);}
 if(path[0]==='quiz-save'){
 const c=await course(str(b.course_id));if(!owns(u,c))fail(403,'Không có quyền sửa.');checkVersion(c,b);if(!validQuiz(b.questions))fail(422,'Mỗi câu cần nội dung, 2–6 lựa chọn và một đáp án đúng.');const r=await run('UPDATE courses SET quiz=?,version=version+1 WHERE id=? AND version=?',JSON.stringify(b.questions),c.id,b.version);if(!r.meta.changes)fail(409,'Nội dung đã thay đổi.');return json({ok:true});}
 if(path[0]==='course-status'){
 const c=await course(str(b.course_id));if(!owns(u,c))fail(403,'Không có quyền sửa.');checkVersion(c,b);
 if(b.status==='PUBLISHED'&&c.status==='DRAFT'){const count=await one('SELECT count(*) n FROM lessons WHERE course_id=?',c.id);if(count.n<1||!validQuiz(JSON.parse(c.quiz)))fail(422,'Cần ít nhất một bài học và một quiz hợp lệ trước khi xuất bản.');}
 else if(!(b.status==='ARCHIVED'&&c.status==='PUBLISHED'))fail(422,'Chuyển trạng thái không hợp lệ.');
 const r=await run('UPDATE courses SET status=?,version=version+1 WHERE id=? AND version=?',b.status,c.id,b.version);if(!r.meta.changes)fail(409,'Nội dung đã thay đổi.');await log(u,b.status==='PUBLISHED'?'Xuất bản khóa học':'Lưu trữ khóa học',c.id);return json({ok:true});}
 if(path[0]==='file-delete'){
 const f=await one('SELECT * FROM materials WHERE id=?',str(b.id));if(!f)fail(404,'Tệp không tồn tại.');await lesson(u,f.lesson_id,true);await run('DELETE FROM materials WHERE id=?',f.id);await env.BUCKET!.delete(f.object_key);return json({ok:true});}
 if(path[0]==='moderate'){
 if(u.role!=='ADMIN')fail(403,'Chỉ quản trị viên có quyền.');const c=await course(str(b.course_id));checkVersion(c,b);const r=await run('UPDATE courses SET hidden=?,version=version+1 WHERE id=? AND version=?',b.hidden?1:0,c.id,b.version);if(!r.meta.changes)fail(409,'Nội dung đã thay đổi.');await log(u,b.hidden?'Ẩn khóa học':'Hiện khóa học',c.id);return json({ok:true});}
 if(path[0]==='member-update'){
 if(u.role!=='ADMIN')fail(403,'Chỉ quản trị viên có quyền.');const member=await one('SELECT * FROM members WHERE id=?',str(b.id));if(!member)fail(404,'Tài khoản không tồn tại.');if(member.role==='ADMIN')fail(403,'Không thay đổi tài khoản quản trị tại đây.');if(!['LEARNER','INSTRUCTOR'].includes(b.role))fail(422,'Vai trò không hợp lệ.');await run('UPDATE members SET role=?,blocked=? WHERE id=?',b.role,b.blocked?1:0,member.id);await log(u,'Cập nhật quyền / trạng thái',member.id);return json({ok:true});}
 fail(404,'Đường dẫn không tồn tại.');
 }catch(e){if(e instanceof Failure)return json({error:e.message},e.status);console.error('API request failed',e instanceof Error?e.message:'unknown');return json({error:'Chưa thể hoàn tất. Vui lòng thử lại sau.'},500);}}
export const GET=handler;export const POST=handler;
