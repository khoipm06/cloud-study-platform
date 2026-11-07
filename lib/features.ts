import {validQuiz,csvCell} from './rules';
export async function initializeFeatures(s:any){
 const {one,all,statement,db}=s;if(await one("SELECT value FROM settings WHERE key='categories_v2'"))return;
 const names=new Set(['Công nghệ','Thiết kế','Kỹ năng',...(await all('SELECT DISTINCT category FROM courses')).map((x:any)=>x.category)]);
 await db().batch([...Array.from(names).map(name=>statement('INSERT OR IGNORE INTO categories(name,normalized) VALUES(?,?)',name,String(name).normalize('NFKC').trim().toLocaleLowerCase('vi'))),statement("INSERT OR IGNORE INTO settings VALUES('categories_v2','1')")]);
}
export async function publicCatalog(s:any,req:Request){
 const {all,one,json}=s;const p=new URL(req.url).searchParams;const page=Math.max(1,Math.min(10000,Math.floor(Number(p.get('page')))||1));const limit=Math.max(1,Math.min(100,Math.floor(Number(p.get('limit')))||12));
 const terms:any[]=[];let where=`c.status='PUBLISHED' AND c.hidden=0 AND NOT ${s.legacySaleReview}`;
 if(p.get('q')){where+=' AND (c.title LIKE ? OR c.description LIKE ?)';terms.push('%'+p.get('q')!.slice(0,150)+'%','%'+p.get('q')!.slice(0,150)+'%');}
 if(p.get('category')){where+=' AND c.category=?';terms.push(p.get('category'));}if(p.get('level')){where+=' AND c.level=?';terms.push(p.get('level'));}
 const rows=await all(`SELECT c.id,c.price_vnd,c.title,c.description,c.category,c.level,c.color,c.status,c.created_at,m.name instructor,(SELECT count(*) FROM lessons l WHERE l.course_id=c.id) lesson_count,(SELECT coalesce(sum(minutes),0) FROM lessons l WHERE l.course_id=c.id) minutes FROM courses c JOIN members m ON m.id=c.owner_id WHERE ${where} ORDER BY c.created_at,c.id LIMIT ? OFFSET ?`,...terms,limit,(page-1)*limit);
 return json({courses:rows,categories:await all('SELECT name,active FROM categories ORDER BY name'),page,limit,total:(await one(`SELECT count(*) total FROM courses c WHERE ${where}`,...terms)).total});
}
export async function recommendations(s:any,u:any,attempt:any){
 const {one,all}=s;const c=await one('SELECT * FROM courses WHERE id=?',attempt.course_id);if(!c||c.hidden||!['PUBLISHED','ARCHIVED'].includes(c.status))return [];
 if(!await one('SELECT 1 FROM enrollments WHERE user_id=? AND course_id=?',u.id,c.id))return [];
 const answers=JSON.parse(attempt.answers),questions=JSON.parse(attempt.snapshot);const ids=new Set(questions.filter((q:any)=>answers[q.id]!==q.correct&&q.lesson_id).map((q:any)=>q.lesson_id));
 return (await all('SELECT id,title,position FROM lessons WHERE course_id=? ORDER BY position',c.id)).filter((l:any)=>ids.has(l.id)).map((l:any)=>({...l,course_id:c.id}));
}
async function ensureBank(s:any,c:any){
 const {one,db,statement,now}=s;if(await one('SELECT 1 FROM question_bank WHERE course_id=? LIMIT 1',c.id))return;
 const q=JSON.parse(c.quiz);if(q.length)await db().batch(q.map((x:any)=>statement('INSERT OR IGNORE INTO question_bank(course_id,id,data,updated_at) VALUES(?,?,?,?)',c.id,x.id,JSON.stringify(x),now())));
}
export async function featureRead(s:any,req:Request,path:string[],u:any){
 const {one,all,course,owns,fail,json}=s;const p=new URL(req.url).searchParams;
 if(path[0]==='categories'){if(u.role!=='ADMIN')fail(403,'Chỉ quản trị viên có quyền.');return json(await all('SELECT t.*,(SELECT count(*) FROM courses c WHERE c.category=t.name) course_count FROM categories t ORDER BY t.name'));}
 if(path[0]==='bank'&&path[1]){const c=await course(path[1]);if(!owns(u,c))fail(403,'Chỉ chủ khóa có quyền quản lý câu hỏi.');await ensureBank(s,c);return json({questions:(await all('SELECT * FROM question_bank WHERE course_id=? ORDER BY updated_at,id',c.id)).map((q:any)=>({...JSON.parse(q.data),version:q.version,archived:q.archived})),revisions:await all('SELECT revision,created_at FROM quiz_revisions WHERE course_id=? ORDER BY revision DESC LIMIT 20',c.id)});}
 if(path[0]==='file-bin'&&path[1]){const c=await course(path[1]);if(!owns(u,c))fail(403,'Không có quyền truy cập.');return json(await all("SELECT m.id,m.name,m.lesson_id,m.detached_at,m.version,l.title lesson_title FROM materials m JOIN lessons l ON l.id=m.lesson_id WHERE l.course_id=? AND m.status='DETACHED' ORDER BY m.detached_at DESC",c.id));}
 if(path[0]==='report'&&path[1]){
 const attemptsSource='(SELECT user_id,course_id,score,status,submitted_at,id FROM attempts UNION ALL SELECT user_id,course_id,score,status,submitted_at,id FROM named_quiz_attempts)';const c=await course(path[1]);if(!owns(u,c))fail(403,'Bạn không có quyền xem báo cáo của khóa này.');
 const total=(await one('SELECT count(*) n FROM lessons WHERE course_id=? AND required=1',c.id)).n;
 const stats=await one(`SELECT (SELECT count(*) FROM enrollments WHERE course_id=?) enrollments,(SELECT count(*) FROM enrollments e WHERE course_id=? AND ? > 0 AND (SELECT count(*) FROM completions x JOIN lessons l ON l.id=x.lesson_id WHERE x.user_id=e.user_id AND l.course_id=e.course_id AND l.required=1)=?) completed,(SELECT count(*) FROM ${attemptsSource} WHERE course_id=? AND status='SUBMITTED') submissions,(SELECT round(avg(score),2) FROM ${attemptsSource} WHERE course_id=? AND status='SUBMITTED') average_score`,c.id,c.id,total,total,c.id,c.id);
 const detail=c.owner_id===u.id;const page=Math.max(1,Math.min(10000,Math.floor(Number(p.get('page')))||1));const limit=20;
 const rows=detail?await all(`SELECT m.name,m.email,e.created_at,e.last_accessed_at,e.completed_at,(SELECT count(*) FROM completions x JOIN lessons l ON l.id=x.lesson_id WHERE x.user_id=e.user_id AND l.course_id=e.course_id AND l.required=1) completed_lessons,(SELECT score FROM ${attemptsSource} a WHERE a.user_id=e.user_id AND a.course_id=e.course_id AND a.status='SUBMITTED' ORDER BY a.submitted_at DESC,a.id DESC LIMIT 1) last_score,(SELECT count(*) FROM ${attemptsSource} a WHERE a.user_id=e.user_id AND a.course_id=e.course_id AND a.status='SUBMITTED') attempt_count FROM enrollments e JOIN members m ON m.id=e.user_id WHERE e.course_id=? ORDER BY e.created_at,m.id LIMIT ? OFFSET ?`,c.id,limit,(page-1)*limit):[];
 if(p.get('format')==='csv'){if(!detail)fail(403,'Chỉ chủ khóa được xuất danh sách học viên.');const csv=[['Họ tên','Email','Ngày ghi danh','Bài bắt buộc hoàn thành','Tổng bài bắt buộc','Điểm gần nhất','Số lượt quiz'],...rows.map((r:any)=>[r.name,r.email,r.created_at,r.completed_lessons,total,r.last_score,r.attempt_count])].map(row=>row.map(csvCell).join(',')).join('\r\n');return new Response('\ufeff'+csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="bao-cao-trang-'+page+'.csv"','Cache-Control':'no-store'}});}
 return json({course:{id:c.id,title:c.title},stats,learners:rows,required_count:total,page,limit,total:stats.enrollments,can_view_learners:detail});
 }
 if(path[0]==='audit'){if(u.role!=='ADMIN')fail(403,'Chỉ quản trị viên có quyền.');const page=Math.max(1,Math.min(10000,Math.floor(Number(p.get('page')))||1));return json({rows:await all('SELECT a.*,m.name FROM audit a LEFT JOIN members m ON m.id=a.actor_id ORDER BY a.created_at DESC,a.id LIMIT 20 OFFSET ?',(page-1)*20),total:(await one('SELECT count(*) n FROM audit')).n,page});}
 return null;
}
export async function featureWrite(s:any,path:string[],u:any,b:any){
 const {one,all,run,statement,db,course,lesson,owns,fail,json,str,checkVersion,log,now,uid,env}=s;
 if(path[0]==='category-save'){
 if(u.role!=='ADMIN')fail(403,'Chỉ quản trị viên có quyền.');const name=str(b.name,2,80).normalize('NFKC');const normalized=name.toLocaleLowerCase('vi');const old=b.original?await one('SELECT * FROM categories WHERE name=?',b.original):null;
 if(b.original&&!old)fail(404,'Danh mục không tồn tại.');if(old)checkVersion(old,b);
 const duplicate=await one('SELECT name FROM categories WHERE normalized=?',normalized);if(duplicate&&duplicate.name!==old?.name)fail(409,'Tên danh mục đã tồn tại.');
 if(old){const result=await db().batch([statement('UPDATE courses SET category=?,version=version+1 WHERE category=? AND EXISTS(SELECT 1 FROM categories WHERE name=? AND version=?)',name,old.name,old.name,b.version),statement('UPDATE categories SET name=?,normalized=?,active=?,version=version+1 WHERE name=? AND version=?',name,normalized,b.active===false?0:1,old.name,b.version)]);if(!result[1].meta.changes)fail(409,'Danh mục đã thay đổi.');}
 else await run('INSERT INTO categories(name,normalized) VALUES(?,?)',name,normalized);
 await log(u,old?'Cập nhật danh mục':'Tạo danh mục',name,b.reason||'');return json({ok:true});
 }
 if(path[0]==='bank-save'){
 const c=await course(str(b.course_id));s.assertEditable(u,c);const q=b.question;if(!validQuiz([q]))fail(422,'Câu hỏi cần 2–6 lựa chọn và một đáp án đúng.');if(q.lesson_id&&!await one('SELECT 1 FROM lessons WHERE id=? AND course_id=?',q.lesson_id,c.id))fail(422,'Bài liên quan không thuộc khóa học.');
 const existing=await one('SELECT * FROM question_bank WHERE course_id=? AND id=?',c.id,q.id);
 const clean={id:q.id,prompt:q.prompt,options:q.options,correct:q.correct,explanation:q.explanation,lesson_id:q.lesson_id||null};
 if(existing){checkVersion(existing,b);const r=await run('UPDATE question_bank SET data=?,version=version+1,archived=?,updated_at=? WHERE course_id=? AND id=? AND version=? AND (? IS NULL OR EXISTS(SELECT 1 FROM lessons WHERE id=? AND course_id=?)) AND '+s.editGuard,JSON.stringify(clean),b.archived?1:0,now(),c.id,q.id,b.version,clean.lesson_id,clean.lesson_id,c.id,c.id,c.version);if(!r.meta.changes)fail(409,'Câu hỏi đã được cập nhật.');}
 else {const r=await run('INSERT INTO question_bank(course_id,id,data,updated_at) SELECT ?,?,?,? WHERE '+s.editGuard+' AND (? IS NULL OR EXISTS(SELECT 1 FROM lessons WHERE id=? AND course_id=?))',c.id,q.id,JSON.stringify(clean),now(),c.id,c.version,clean.lesson_id,clean.lesson_id,c.id);if(!r.meta.changes)fail(409,'Bài học đã thay đổi.');}return json({ok:true});
 }
 if(path[0]==='lesson-visit'){
 const {l,c}=await lesson(u,str(b.lesson_id));await run('UPDATE enrollments SET last_lesson_id=?,last_accessed_at=? WHERE user_id=? AND course_id=?',l.id,now(),u.id,c.id);return json({ok:true});
 }
 if(path[0]==='lesson-order'){
 const c=await course(str(b.course_id));if(!owns(u,c))fail(403,'Không có quyền sửa.');if(c.status!=='DRAFT')fail(409,'Cấu trúc khóa đã xuất bản được giữ nguyên.');checkVersion(c,b);
 const ls=await all('SELECT id FROM lessons WHERE course_id=?',c.id);if(!Array.isArray(b.ids)||b.ids.length!==ls.length||new Set(b.ids).size!==ls.length||b.ids.some((id:any)=>!ls.some((l:any)=>l.id===id)))fail(422,'Danh sách phải chứa đúng mỗi bài một lần.');
 const guard="EXISTS(SELECT 1 FROM courses WHERE id=? AND status='DRAFT' AND version=?)";
 const commands=[statement(`UPDATE lessons SET position=-position WHERE course_id=? AND ${guard}`,c.id,c.id,b.version),...b.ids.map((id:string,i:number)=>statement(`UPDATE lessons SET position=?,version=version+1 WHERE id=? AND course_id=? AND ${guard}`,i+1,id,c.id,c.id,b.version)),statement("UPDATE courses SET version=version+1 WHERE id=? AND status='DRAFT' AND version=?",c.id,b.version)];const r=await db().batch(commands);if(!r[r.length-1].meta.changes)fail(409,'Thứ tự đã thay đổi. Hãy tải lại.');return json({ok:true});
 }
 if(path[0]==='draft-delete'){
 const c=await course(str(b.course_id));if(!owns(u,c))fail(403,'Không có quyền xóa.');if(c.status!=='DRAFT')fail(409,'Chỉ xóa bản nháp. Với khóa đã xuất bản, hãy dùng Lưu trữ.');checkVersion(c,b);if(await one('SELECT 1 FROM enrollments WHERE course_id=? LIMIT 1',c.id))fail(409,'Không xóa khóa có dữ liệu học tập.');
 const target=b.lesson_id?str(b.lesson_id):null;if(target&&!await one('SELECT 1 FROM lessons WHERE id=? AND course_id=?',target,c.id))fail(404,'Bài học không thuộc khóa.');
 const guard="EXISTS(SELECT 1 FROM courses WHERE id=? AND status='DRAFT' AND version=? AND NOT EXISTS(SELECT 1 FROM enrollments WHERE course_id=?))";
 const where=target?'course_id=? AND id=?':'course_id=?';const values=target?[c.id,target]:[c.id];const args=[c.id,b.version,c.id];
 const commands=[statement(`INSERT OR IGNORE INTO retired_objects(object_key,delete_after) SELECT object_key,? FROM materials WHERE lesson_id IN(SELECT id FROM lessons WHERE ${where}) AND ${guard}`,new Date(Date.now()+7*86400000).toISOString(),...values,...args),statement(`DELETE FROM materials WHERE lesson_id IN(SELECT id FROM lessons WHERE ${where}) AND ${guard}`,...values,...args),statement(`DELETE FROM notes WHERE lesson_id IN(SELECT id FROM lessons WHERE ${where}) AND ${guard}`,...values,...args)];
 if(target){for(const nq of await all('SELECT * FROM course_quizzes WHERE course_id=?',c.id)){const old=JSON.parse(nq.questions),updated=old.map((q:any)=>q.lesson_id===target?{...q,lesson_id:null}:q);if(JSON.stringify(old)!==JSON.stringify(updated)){commands.push(statement(`INSERT INTO named_quiz_revisions(quiz_id,revision,questions,created_at) SELECT ?,?,?,? WHERE ${guard}`,nq.id,nq.revision+1,JSON.stringify(updated),now(),...args),statement(`UPDATE course_quizzes SET questions=?,revision=revision+1,version=version+1,updated_at=? WHERE id=? AND ${guard}`,JSON.stringify(updated),now(),nq.id,...args));}}const quiz=JSON.parse(c.quiz).map((q:any)=>q.lesson_id===target?{...q,lesson_id:null}:q);const bank=await all('SELECT * FROM question_bank WHERE course_id=?',c.id);for(const q of bank){const d=JSON.parse(q.data);if(d.lesson_id===target)commands.push(statement(`UPDATE question_bank SET data=?,version=version+1 WHERE course_id=? AND id=? AND ${guard}`,JSON.stringify({...d,lesson_id:null}),c.id,q.id,...args));}commands.push(statement(`DELETE FROM lessons WHERE ${where} AND ${guard}`,...values,...args),statement(`UPDATE lessons SET position=-position WHERE course_id=? AND ${guard}`,c.id,...args));
 const remaining=await all('SELECT id FROM lessons WHERE course_id=? AND id<>? ORDER BY position',c.id,target);remaining.forEach((l:any,i:number)=>commands.push(statement(`UPDATE lessons SET position=?,version=version+1 WHERE id=? AND ${guard}`,i+1,l.id,...args)));
 commands.push(statement(`UPDATE courses SET quiz=?,version=version+1 WHERE id=? AND ${guard}`,JSON.stringify(quiz),c.id,...args));}
 else commands.push(statement(`DELETE FROM lab_exercises WHERE course_id=? AND ${guard}`,c.id,...args),statement(`DELETE FROM named_quiz_revisions WHERE quiz_id IN(SELECT id FROM course_quizzes WHERE course_id=?) AND ${guard}`,c.id,...args),statement(`DELETE FROM course_quizzes WHERE course_id=? AND ${guard}`,c.id,...args),statement(`DELETE FROM question_bank WHERE course_id=? AND ${guard}`,c.id,...args),statement(`DELETE FROM quiz_revisions WHERE course_id=? AND ${guard}`,c.id,...args),statement(`DELETE FROM lessons WHERE course_id=? AND ${guard}`,c.id,...args),statement(`DELETE FROM courses WHERE id=? AND ${guard}`,c.id,...args));
 const r=await db().batch(commands);if(!r[r.length-1].meta.changes)fail(409,'Bản nháp đã thay đổi.');await log(u,target?'Xóa bài nháp':'Xóa khóa nháp',target||c.id);return json({ok:true});
 }
 if(path[0]==='file-restore'){
 const f=await one("SELECT * FROM materials WHERE id=? AND status='DETACHED'",str(b.id));if(!f)fail(404,'Tệp không còn trong mục đã gỡ.');const {c}=await lesson(u,f.lesson_id,true);checkVersion(f,b);if(new Date(f.detached_at).getTime()+7*86400000<=Date.now())fail(409,'Đã hết thời gian khôi phục 7 ngày.');if(!await env.BUCKET!.head(f.object_key))fail(404,'Không tìm thấy đối tượng lưu trữ.');const r=await run("UPDATE materials SET status='READY',detached_at=NULL,version=version+1 WHERE id=? AND version=? AND status='DETACHED' AND "+s.editGuard,f.id,b.version,c.id,c.version);if(!r.meta.changes)fail(409,'Trạng thái tệp đã thay đổi.');await log(u,'Khôi phục học liệu',f.id);return json({ok:true});
 }
 if(path[0]==='maintenance'){
 if(u.role!=='ADMIN')fail(403,'Chỉ quản trị viên được dọn tệp.');const cutoff=new Date(Date.now()-7*86400000).toISOString();const fs=await all("SELECT * FROM materials WHERE status='DETACHED' AND detached_at<=? LIMIT 30",cutoff);let count=0;
 for(const f of fs){await env.BUCKET!.delete(f.object_key);await run("DELETE FROM materials WHERE id=? AND status='DETACHED' AND detached_at<=?",f.id,cutoff);count++;}
 for(const f of await all('SELECT * FROM retired_objects WHERE delete_after<=? LIMIT 30',now())){await env.BUCKET!.delete(f.object_key);await run('DELETE FROM retired_objects WHERE object_key=?',f.object_key);count++;}
 await log(u,'Dọn học liệu hết hạn',String(count));return json({deleted:count});
 }
 return null;
}
