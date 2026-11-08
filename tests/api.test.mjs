// Exercises the actual route module with SQLite and an in-memory R2 adapter.
// No network listeners, production records, or platform credentials are used.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {AsyncLocalStorage} from 'node:async_hooks';
import ts from 'typescript';
import {runLearningChecks} from './learning-cases.mjs';
import {runLabChecks} from './lab-cases.mjs';
import {runCompletionChecks} from './completion-cases.mjs';
import {runAdvancedChecks} from './advanced-cases.mjs';
import {runReminderChecks} from './reminder-cases.mjs';
import {runRelease16Checks} from './release16-cases.mjs';
import {runMarketplaceChecks} from './marketplace-cases.mjs';
const database=new DatabaseSync(':memory:');database.exec('PRAGMA foreign_keys=ON;');
const migrationFiles=readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort();
for(const file of migrationFiles)database.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
class Statement {
  constructor(sql, args = []) { this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.sql, args); }
  async first() { return database.prepare(this.sql).get(...this.args) || null; }
  allSync() { return { results: database.prepare(this.sql).all(...this.args) }; }
  runSync() { return { meta: { changes: Number(database.prepare(this.sql).run(...this.args).changes) } }; }
  async all() { return this.allSync(); }
  async run() { return this.runSync(); }
}
const DB = {
  prepare: sql => new Statement(sql),
  async batch(statements) {
    database.exec('BEGIN');
    try {
      const result = statements.map(statement => /^\s*(SELECT|PRAGMA)/i.test(statement.sql) ? statement.allSync() : statement.runSync());
      database.exec('COMMIT');
      return result;
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  },
};
const files=new Map();const BUCKET={put:async(k,b)=>files.set(k,b instanceof ArrayBuffer?new Uint8Array(b):Uint8Array.from(b)),get:async k=>files.has(k)?{body:files.get(k),arrayBuffer:async()=>Uint8Array.from(files.get(k)).buffer}:null,head:async k=>files.has(k)?{size:files.get(k).byteLength}:null,delete:async k=>{for(const key of Array.isArray(k)?k:[k])files.delete(key);},list:async({prefix})=>({objects:[...files.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))})};
const auth=new AsyncLocalStorage();
async function load(relative){let s=readFileSync(new URL(relative,import.meta.url),'utf8');if(relative.endsWith('marketplace.ts'))s=s.replace("import { validQuiz } from './rules';",'const {validQuiz}=globalThis.__mohocRules;');if(relative.endsWith('auth-services.ts'))s=s.replace("import {emailConfiguration,issueEmailToken,emailToken} from './email-delivery';",'const {emailConfiguration,issueEmailToken,emailToken}=globalThis.__mohocEmail;');if(relative.endsWith('operations.ts'))s=s.replace("import {emailConfiguration} from './email-delivery';",'const {emailConfiguration}=globalThis.__mohocEmail;');if(relative.endsWith('tutor-services.ts'))s=s.replace("import {searchCourseMaterials} from './advanced-services';",'const {searchCourseMaterials}=globalThis.__mohocAdvanced;');if(relative.endsWith('social-services.ts'))s=s.replace("import {fileKind} from './rules';",'const {fileKind}=globalThis.__mohocRules;');if(relative.endsWith('operations.ts'))s=s.replace("import {authRuntimeCheck} from './auth-services';",'const {authRuntimeCheck}=globalThis.__mohocAuth;').replace("import {scanPendingFiles} from './social-services';",'const {scanPendingFiles}=globalThis.__mohocSocial;');if(relative.endsWith('operations.ts'))s=s.replace("import {syncLearningNotifications} from './learning-services';",'const {syncLearningNotifications}=globalThis.__mohocLearning;').replace("import {expireMentorBookings} from './advanced-services';",'const {expireMentorBookings}=globalThis.__mohocAdvanced;');if(relative.endsWith('advanced-services.ts'))s=s.replace("import {validQuiz,grade,redact} from './rules';",'const {validQuiz,grade,redact}=globalThis.__mohocRules;').replace("import {validTimezone} from './planning';",'const {validTimezone}=globalThis.__mohocPlanning;').replace("import {recommendations} from './features';",'const {recommendations}=globalThis.__mohocFeatures;');if(relative.endsWith('learning-services.ts'))s=s.replace("import {validTimezone,zonedDay,validDay} from './planning';",'const {validTimezone,zonedDay,validDay}=globalThis.__mohocPlanning;');if(relative.endsWith('features.ts'))s=s.replace("import {validQuiz,csvCell} from './rules';",'const {validQuiz,csvCell}=globalThis.__mohocRules;');if(relative.endsWith('reminder-services.ts'))s=s.replace("import {allowedPushEndpoint, validatePushKeys, pushConfiguration, sendWebPush, base64url} from './web-push';",'const {allowedPushEndpoint,validatePushKeys,pushConfiguration,sendWebPush,base64url}=globalThis.__mohocPush;');if(relative.endsWith('operations.ts'))s=s.replace("import {dispatchStudyPush} from './reminder-services';",'const {dispatchStudyPush}=globalThis.__mohocReminders;').replace("import {pushRuntimeCheck} from './web-push';",'const {pushRuntimeCheck}=globalThis.__mohocPush;');const js=ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));}
const rules=await load('../lib/rules.ts');const seeds=await load('../lib/seed.ts');
globalThis.__mohocRules=rules;const features=await load('../lib/features.ts');const planning=await load('../lib/planning.ts');globalThis.__mohocPlanning=planning;const learning=await load('../lib/learning-services.ts');globalThis.__mohocFeatures=features;const advanced=await load('../lib/advanced-services.ts');globalThis.__mohocLearning=learning;globalThis.__mohocAdvanced=advanced;const email=await load('../lib/email-delivery.ts');globalThis.__mohocEmail=email;const credentials=await load('../lib/auth-services.ts');globalThis.__mohocAuth=credentials;const commerce=await load('../lib/commerce-services.ts');const marketplace=await load('../lib/marketplace.ts');const social=await load('../lib/social-services.ts');globalThis.__mohocSocial=social;const push=await load('../lib/web-push.ts');globalThis.__mohocPush=push;const reminders=await load('../lib/reminder-services.ts');globalThis.__mohocReminders=reminders;const operations=await load('../lib/operations.ts');const labs=await load('../lib/lab-services.ts');const tutor=await load('../lib/tutor-services.ts');
globalThis.__mohocTest={env:{DB,BUCKET,BOOTSTRAP_ADMIN_EMAIL:'owner@example.test'},getChatGPTUser:async()=>auth.getStore()||null,...rules,...seeds,...features,...learning,...advanced,...operations,...labs,...credentials,...commerce,...marketplace,...social,...reminders,...tutor};
let source=readFileSync(new URL('../app/api/[...path]/route.ts',import.meta.url),'utf8');source=source.replace(/^import .*;\n/gm,'');
source='const {env,getChatGPTUser,seedCourses,grade,redact,validQuiz,validAnswers,fileKind,videoSource,initializeFeatures,publicCatalog,featureRead,featureWrite,recommendations,learningRead,learningWrite,advancedPublic,advancedRead,advancedWrite,operationsRead,operationsWrite,portableBackupImport,tutorRead,tutorWrite,labRead,labWrite,authPublic,authRead,authWrite,passwordIdentity,hasPasswordSession,commercePublic,commerceRead,commerceWrite,accountWalletBalance,legacySaleReview,marketplaceRead,marketplaceWrite,socialRead,socialWrite,socialUpload,reminderRead,reminderWrite,calendarRead}=globalThis.__mohocTest;\n'+source;
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const route=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const owner={userId:'owner',displayName:'Người tạo đồ án',email:'owner@example.test'};
const learner={userId:'learner',displayName:'Học viên A',email:'learner@example.test'};
const other={userId:'other',displayName:'Học viên B',email:'other@example.test'};
let checks=0;let finished=false;process.on('beforeExit',()=>{if(!finished){console.error('FAIL test suite ended before all checks completed');process.exitCode=1;}});
async function request(user,path,body,options={}){let deadline;try{return await Promise.race([new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error('API check timed out: '+path)),15000);}),auth.run(user,async()=>{const headers={'X-Mo-Hoc':'1','Origin':'https://test.local',...options.headers};const req=new Request('https://test.local/api/'+path,{method:body===undefined?'GET':'POST',headers,duplex:'half',body:body===undefined?undefined:body instanceof FormData||body instanceof ArrayBuffer||ArrayBuffer.isView(body)||body instanceof ReadableStream?body:JSON.stringify(body)});const res=await route[body===undefined?'GET':'POST'](req);if(options.rawResponse)return {status:res.status,data:null,res};let data;if(res.headers.get('content-type')==='application/octet-stream')data=new Uint8Array(await res.clone().arrayBuffer());else try{data=await res.clone().json();}catch{data=await res.text();}return {status:res.status,data,res};})]);}finally{clearTimeout(deadline);}}
function ok(label,result,expected=200){assert.equal(result.status,expected,`${label}: ${JSON.stringify(result.data)}`);checks++;console.log('PASS',label);return result.data;}
ok('anonymous request rejected',await request(null,'state'),401);
const firstVisitor=ok('first public visitor cannot claim administrator',await request(other,'state'));assert.equal(firstVisitor.user.role,'LEARNER');assert.equal(database.prepare("SELECT * FROM settings WHERE key='owner'").get(),undefined);
const initial=ok('configured owner bootstrap and seed',await request(owner,'state'));assert.equal(initial.courses.length,6);assert.equal(initial.user.role,'ADMIN');
const student=ok('new users become learners',await request(learner,'state'));assert.equal(student.user.role,'LEARNER');
ok('cross-origin mutation rejected',await request(learner,'profile',{name:'Bad',goal:5},{headers:{Origin:'https://evil.test'}}),403);
ok('missing CSRF header rejected',await request(learner,'profile',{name:'Bad',goal:5},{headers:{'X-Mo-Hoc':''}}),403);
ok('learner cannot administer',await request(learner,'admin'),403);
ok('invalid course metadata is rejected for a regular user',await request(learner,'course-save',{title:'Bad'}),422);
const preview=ok('catalog detail redacts lesson body and quiz key',await request(learner,'courses/web-can-ban'));assert.equal(preview.lessons[0].content,undefined);assert.equal(preview.quiz,undefined);
ok('unenrolled completion rejected',await request(learner,'complete',{lesson_id:'web-can-ban-1'}),403);
ok('enrollment succeeds',await request(learner,'enroll',{course_id:'web-can-ban'}));ok('duplicate enrollment is idempotent',await request(learner,'enroll',{course_id:'web-can-ban'}));assert.equal(database.prepare("SELECT count(*) n FROM enrollments WHERE user_id='learner'").get().n,1);
const detail=ok('enrolled learner receives content',await request(learner,'courses/web-can-ban'));assert.ok(detail.lessons[0].content);assert.equal(detail.quiz,undefined);
ok('completion saves',await request(learner,'complete',{lesson_id:'web-can-ban-1'}));ok('repeated completion does not inflate count',await request(learner,'complete',{lesson_id:'web-can-ban-1'}));assert.equal(database.prepare("SELECT count(*) n FROM completions WHERE user_id='learner'").get().n,1);
ok('note saves',await request(learner,'notes',{lesson_id:'web-can-ban-1',body:'HTML là cấu trúc. CSS là giao diện.'}));
const isolated=ok('notes isolated across users',await request(other,'state'));assert.equal(isolated.notes.length,0);
const attempt=ok('quiz starts without answers or explanations',await request(learner,'quiz-start',{course_id:'web-can-ban'}),201);assert.ok(attempt.questions.every(q=>!('correct'in q)&&!('explanation'in q)));
const same=ok('active attempt resumes',await request(learner,'quiz-start',{course_id:'web-can-ban'}));assert.equal(same.id,attempt.id);
ok('another user cannot read attempt',await request(other,'attempts/'+attempt.id),404);
ok('invalid option is rejected',await request(learner,'quiz-answers',{attempt_id:attempt.id,version:1,answers:{w1:99}}),422);
const saved=ok('answers persist before submit',await request(learner,'quiz-answers',{attempt_id:attempt.id,version:1,answers:{w1:0,w2:1,w3:2}}));assert.equal(saved.version,2);
ok('stale answer update rejected',await request(learner,'quiz-answers',{attempt_id:attempt.id,version:1,answers:{w1:1}}),409);
const resumed=ok('reopened quiz restores saved answers',await request(learner,'quiz-start',{course_id:'web-can-ban'}));assert.deepEqual(resumed.answers,{w1:0,w2:1,w3:2});
const result=ok('server grades quiz correctly',await request(learner,'quiz-submit',{attempt_id:attempt.id,version:2,answers:resumed.answers}));assert.equal(result.score,100);assert.equal(result.status,'SUBMITTED');assert.ok('correct'in result.questions[0]);
const repeated=ok('repeated submit returns immutable result',await request(learner,'quiz-submit',{attempt_id:attempt.id,version:1,answers:{w1:1}}));assert.equal(repeated.score,100);
ok('submitted answers cannot change',await request(learner,'quiz-answers',{attempt_id:attempt.id,version:3,answers:{w1:1}}),409);
const newCourse=ok('owner creates draft',await request(owner,'course-save',{title:'Khóa kiểm thử',description:'Nội dung phục vụ kiểm thử học tập.',category:'Công nghệ',level:'Nhập môn'}),201);
ok('draft is private',await request(learner,'courses/'+newCourse.id),403);
ok('incomplete draft cannot publish',await request(owner,'course-status',{course_id:newCourse.id,status:'PUBLISHED',version:1}),422);
const newLesson=ok('owner adds lesson',await request(owner,'lesson-save',{course_id:newCourse.id,title:'Bài kiểm thử đầu tiên',content:'Nội dung bài kiểm thử có đủ chi tiết để đọc.',minutes:10}),201);
const q=[{id:'t1',prompt:'Một cộng một bằng mấy?',options:['Hai','Ba'],correct:0,explanation:'1 + 1 = 2.'}];
ok('owner authors quiz',await request(owner,'quiz-save',{course_id:newCourse.id,version:2,questions:q}));
ok('stale course change rejected',await request(owner,'course-status',{course_id:newCourse.id,status:'PUBLISHED',version:1}),409);
ok('valid course publishes',await request(owner,'course-status',{course_id:newCourse.id,status:'PUBLISHED',version:3}));
ok('published lesson structure freezes',await request(owner,'lesson-save',{course_id:newCourse.id,title:'Bài mới không được thêm',content:'Nội dung này không được phép thêm vào khóa đã xuất bản.',minutes:10}),409);
const badFile=new FormData();badFile.set('lesson_id',newLesson.id);badFile.set('file',new File(['hello'],'fake.pdf',{type:'application/pdf'}));ok('fake PDF rejected by signature',await request(owner,'upload',badFile),422);
const goodFile=new FormData();goodFile.set('lesson_id',newLesson.id);goodFile.set('file',new File(['%PDF-1.4\n%%EOF'],'example.pdf',{type:'application/pdf'}));const file=ok('valid-signature PDF persists to R2',await request(owner,'upload',goodFile),201);assert.equal(files.size,1);
ok('non-enrolled file access rejected',await request(learner,'files/'+file.id),403);
ok('authorized file download works',await request(owner,'files/'+file.id));
ok('owner detaches file with retention',await request(owner,'file-delete',{id:file.id,version:1}));assert.equal(files.size,1);
ok('detached file cannot be downloaded',await request(owner,'files/'+file.id),404);
ok('owner restores file within retention',await request(owner,'file-restore',{id:file.id,version:2}));
ok('restored attachment downloads',await request(owner,'files/'+file.id));
ok('hidden course blocks learning',await request(owner,'moderate',{course_id:'web-can-ban',hidden:true,version:1,reason:'Tạm ẩn để kiểm tra nội dung'}));ok('hidden lesson cannot complete',await request(learner,'complete',{lesson_id:'web-can-ban-2'}),403);
ok('personal quiz history retained after moderation',await request(learner,'attempts/'+attempt.id));
ok('admin identity cannot be downgraded',await request(owner,'member-update',{id:'owner',role:'LEARNER',blocked:true,reason:'Kiểm thử quyền truy cập'}),403);
// V2 integration cases
assert.equal(rules.grade(q,{t1:0}),100);assert.equal(rules.grade(q,{t1:1}),0);assert.equal(rules.validQuiz([{...q[0],correct:9}]),false);
const publicList=ok('anonymous public catalog supports bounded pagination',await request(null,'catalog?limit=2&page=1'));assert.equal(publicList.courses.length,2);assert.equal(publicList.total,6);assert.ok(publicList.courses.every(c=>!('quiz'in c)));
const publicDetail=ok('anonymous course outline stays public',await request(null,'courses/'+newCourse.id));assert.equal(publicDetail.lessons[0].content,undefined);assert.equal(publicDetail.lessons[0].video_url,undefined);
ok('hidden outline is not public',await request(null,'courses/web-can-ban'),404);
ok('learner cannot manage categories',await request(learner,'categories'),403);
ok('admin creates category',await request(owner,'category-save',{name:'Ngoại ngữ'}));
ok('normalized duplicate category rejected',await request(owner,'category-save',{name:'ngoại NGỮ'}),409);
const categoryCourse=ok('create draft in new category',await request(owner,'course-save',{title:'Học từ vựng',description:'Học từ vựng qua câu và ngữ cảnh.',category:'Ngoại ngữ',level:'Nhập môn'}),201);
ok('category rename cascades to existing courses',await request(owner,'category-save',{original:'Ngoại ngữ',name:'Ngôn ngữ',active:true,version:1}));assert.equal(database.prepare('SELECT category FROM courses WHERE id=?').get(categoryCourse.id).category,'Ngôn ngữ');
ok('category version conflict rejected',await request(owner,'category-save',{original:'Ngôn ngữ',name:'Sai phiên bản',version:1}),409);
ok('category can be deactivated',await request(owner,'category-save',{original:'Ngôn ngữ',name:'Ngôn ngữ',active:false,version:2}));
ok('inactive category rejects new course',await request(owner,'course-save',{title:'Không được tạo',description:'Không tạo khóa mới trong danh mục ngừng dùng.',category:'Ngôn ngữ',level:'Nhập môn'}),422);
const draft=ok('create a multi-lesson draft',await request(owner,'course-save',{title:'Kiểm thử tính năng v2',description:'Bài học bắt buộc và tự chọn cho bài kiểm thử.',category:'Kỹ năng',level:'Cơ bản'}),201);
const must=ok('add mandatory text lesson',await request(owner,'lesson-save',{course_id:draft.id,title:'Bài bắt buộc',content:'Nội dung bài bắt buộc phục vụ kiểm thử tiến độ.',minutes:5,required:true}),201);
const optional=ok('add optional HTTPS video lesson',await request(owner,'lesson-save',{course_id:draft.id,title:'Video mở rộng',content:'',type:'VIDEO_LINK',video_url:'https://youtu.be/dQw4w9WgXcQ',minutes:4,required:false}),201);
ok('non-HTTPS video rejected',await request(owner,'lesson-save',{course_id:draft.id,title:'Video không hợp lệ',content:'',type:'VIDEO_LINK',video_url:'javascript:alert(1)',minutes:4}),422);
let d=ok('read draft structure',await request(owner,'courses/'+draft.id));assert.equal(d.lessons[1].required,0);assert.equal(d.lessons[1].type,'VIDEO_LINK');
ok('duplicate lesson ordering rejected',await request(owner,'lesson-order',{course_id:draft.id,version:d.version,ids:[must.id,must.id]}),422);
ok('reorder is complete and atomic',await request(owner,'lesson-order',{course_id:draft.id,version:d.version,ids:[optional.id,must.id]}));
ok('stale course order rejected',await request(owner,'lesson-order',{course_id:draft.id,version:d.version,ids:[must.id,optional.id]}),409);
d=ok('ordering persisted',await request(owner,'courses/'+draft.id));assert.deepEqual(d.lessons.map(l=>l.id),[optional.id,must.id]);
const bq={id:'bank-q1',prompt:'Câu liên quan bài bắt buộc?',options:['Đúng','Sai'],correct:0,explanation:'Giải thích một.',lesson_id:must.id};
ok('learner cannot read question bank',await request(learner,'bank/'+draft.id),403);
ok('bank rejects cross-course lesson reference',await request(owner,'bank-save',{course_id:draft.id,question:{...bq,lesson_id:newLesson.id}}),422);
ok('author saves reusable question',await request(owner,'bank-save',{course_id:draft.id,question:bq}));
let bank=ok('bank preserves linked lesson',await request(owner,'bank/'+draft.id));assert.equal(bank.questions[0].lesson_id,must.id);
ok('author updates bank with version guard',await request(owner,'bank-save',{course_id:draft.id,question:{...bq,explanation:'Giải thích hai.'},version:1}));
ok('stale bank update rejected',await request(owner,'bank-save',{course_id:draft.id,question:bq,version:1}),409);
let q2={...bq,id:'bank-q2',prompt:'Câu thứ hai cùng bài?',correct:1};
ok('configure quiz from linked questions',await request(owner,'quiz-save',{course_id:draft.id,version:d.version,questions:[bq,q2]}));
d=(await request(owner,'courses/'+draft.id)).data;
ok('publish complete draft',await request(owner,'course-status',{course_id:draft.id,status:'PUBLISHED',version:d.version}));
d=(await request(owner,'courses/'+draft.id)).data;
ok('cannot reorder a published course',await request(owner,'lesson-order',{course_id:draft.id,version:d.version,ids:[must.id,optional.id]}),409);
ok('cannot delete published course',await request(owner,'draft-delete',{course_id:draft.id,version:d.version}),409);
const ml=d.lessons.find(l=>l.id===must.id);ok('mandatory flag freezes after publication',await request(owner,'lesson-save',{course_id:draft.id,id:must.id,version:ml.version,title:ml.title,content:ml.content,minutes:ml.minutes,required:false}),409);
ok('enroll in mixed-required course',await request(learner,'enroll',{course_id:draft.id}));
ok('last lesson visit is saved',await request(learner,'lesson-visit',{lesson_id:optional.id}));
assert.equal((await request(learner,'courses/'+draft.id)).data.last_lesson_id,optional.id);
ok('mandatory lesson completes course without optional lesson',await request(learner,'complete',{lesson_id:must.id}));const completedAt=database.prepare('SELECT completed_at FROM enrollments WHERE course_id=? AND user_id=?').get(draft.id,learner.userId).completed_at;assert.ok(completedAt);
ok('repeat completion preserves course completion time',await request(learner,'complete',{lesson_id:must.id}));assert.equal(database.prepare('SELECT completed_at FROM enrollments WHERE course_id=? AND user_id=?').get(draft.id,learner.userId).completed_at,completedAt);
const progress=(await request(learner,'state')).data.courses.find(c=>c.id===draft.id);assert.equal(progress.required_count,1);assert.equal(progress.completed,1);assert.equal(progress.lesson_count,2);
const older=ok('start immutable quiz snapshot',await request(learner,'quiz-start',{course_id:draft.id}),201);
ok('publish later quiz revision',await request(owner,'quiz-save',{course_id:draft.id,version:d.version,questions:[{...bq,correct:1,explanation:'Bản mới.'},q2]}));
const oldSnapshot=ok('active attempt retains old question',await request(learner,'quiz-start',{course_id:draft.id}));assert.equal(oldSnapshot.id,older.id);
const incorrect=ok('save one wrong answer',await request(learner,'quiz-answers',{attempt_id:older.id,version:1,answers:{'bank-q1':1}}));
const review=ok('submit grades persisted answers and deduplicates review lessons',await request(learner,'quiz-submit',{attempt_id:older.id,version:incorrect.version,answers:{'bank-q1':0,'bank-q2':1}}));assert.equal(review.score,0);assert.equal(review.questions[0].correct,0);assert.equal(review.review_lessons.length,1);assert.equal(review.review_lessons[0].id,must.id);
const blankAttempt=ok('start another quiz',await request(learner,'quiz-start',{course_id:draft.id}),201);
const cleared=ok('save then clear answer',await request(learner,'quiz-answers',{attempt_id:blankAttempt.id,version:1,answers:{'bank-q1':1}}));
const emptySaved=ok('clearing persists',await request(learner,'quiz-answers',{attempt_id:blankAttempt.id,version:cleared.version,answers:{}}));
const blankScore=ok('blank quiz submission is allowed and scores zero',await request(learner,'quiz-submit',{attempt_id:blankAttempt.id,version:emptySaved.version}));assert.equal(blankScore.score,0);assert.equal(blankScore.review_lessons.length,1);
const allRight=ok('start perfect-score attempt',await request(learner,'quiz-start',{course_id:draft.id}),201);
const rightSaved=(await request(learner,'quiz-answers',{attempt_id:allRight.id,version:1,answers:{'bank-q1':1,'bank-q2':1}})).data;
const perfect=ok('perfect score produces no review links',await request(learner,'quiz-submit',{attempt_id:allRight.id,version:rightSaved.version}));assert.equal(perfect.score,100);assert.deepEqual(perfect.review_lessons,[]);
const report=ok('owner sees paginated learner report',await request(owner,'report/'+draft.id));assert.equal(report.stats.enrollments,1);assert.equal(report.stats.completed,1);assert.equal(report.learners[0].last_score,100);
ok('learner cannot access instructor report',await request(learner,'report/'+draft.id),403);
const csv=ok('owner exports current report page as CSV',await request(owner,'report/'+draft.id+'?format=csv'));assert.match(csv,/Họ tên/);assert.match(csv,/learner@example.test/);
ok('obsolete instructor role cannot be assigned',await request(owner,'member-update',{id:other.userId,role:'INSTRUCTOR',blocked:false,reason:'Vai trò cũ trong bộ kiểm thử'}),422);
ok('another creator cannot view report',await request(other,'report/'+draft.id),403);
const otherCourse=ok('regular user creates own course',await request(other,'course-save',{title:'Khóa của giảng viên khác',description:'Dữ liệu này dùng kiểm thử phân quyền báo cáo.',category:'Kỹ năng',level:'Nhập môn'}),201);
const adminAggregate=ok('non-owner admin receives aggregate report only',await request(owner,'report/'+otherCourse.id));assert.equal(adminAggregate.can_view_learners,false);assert.deepEqual(adminAggregate.learners,[]);
ok('non-owner admin cannot export student details',await request(owner,'report/'+otherCourse.id+'?format=csv'),403);
ok('learner cannot restore owner materials',await request(learner,'file-restore',{id:file.id,version:3}),404);
ok('detach restored file again',await request(owner,'file-delete',{id:file.id,version:3}));
const retained=ok('maintenance retains young detached objects',await request(owner,'maintenance',{}));assert.equal(retained.deleted,0);assert.equal(files.size,1);
database.prepare("UPDATE materials SET detached_at=? WHERE id=?").run(new Date(Date.now()-8*86400000).toISOString(),file.id);
ok('expired material cannot be restored',await request(owner,'file-restore',{id:file.id,version:4}),409);
const purged=ok('maintenance deletes expired metadata and object',await request(owner,'maintenance',{}));assert.equal(purged.deleted,1);assert.equal(files.size,0);
ok('learner cannot purge storage',await request(learner,'maintenance',{}),403);
const deleteDraft=ok('create removable draft',await request(owner,'course-save',{title:'Bản nháp cần dọn',description:'Bản nháp chưa có người học để thử chức năng xóa.',category:'Kỹ năng',level:'Nhập môn'}),201);
const dl=ok('add removable draft lesson',await request(owner,'lesson-save',{course_id:deleteDraft.id,title:'Bài sẽ xóa',content:'Nội dung bài sẽ xóa cùng học liệu của bản nháp.',minutes:3}),201);
const retainedFile=new FormData();retainedFile.set('lesson_id',dl.id);retainedFile.set('file',new File(['%PDF-1.4\n%%EOF'],'retained.pdf',{type:'application/pdf'}));ok('draft material uploads',await request(owner,'upload',retainedFile),201);
const dc=(await request(owner,'courses/'+deleteDraft.id)).data;
ok('draft deletion removes records but retains object for later cleanup',await request(owner,'draft-delete',{course_id:deleteDraft.id,version:dc.version}));assert.equal(files.size,1);assert.equal(database.prepare('SELECT count(*) n FROM retired_objects').get().n,1);assert.equal(database.prepare('SELECT id FROM courses WHERE id=?').get(deleteDraft.id),undefined);
ok('admin history has reasons and request ids',await request(owner,'audit?page=1'));const auditRows=(await request(owner,'audit?page=1')).data.rows;assert.ok(auditRows.every(r=>r.request_id));assert.ok(auditRows.some(r=>r.reason));
const latest=(await request(owner,'courses/'+draft.id)).data;
ok('moderation reason required',await request(owner,'moderate',{course_id:draft.id,version:latest.version,hidden:true}),422);
ok('hide reviewed course',await request(owner,'moderate',{course_id:draft.id,version:latest.version,hidden:true,reason:'Tạm ẩn để kiểm tra quyền ôn tập'}));
const hiddenHistory=ok('historical result survives but unauthorized review links disappear',await request(learner,'attempts/'+older.id));assert.deepEqual(hiddenHistory.review_lessons,[]);
assert.equal(rules.videoSource('http://example.com'),null);assert.equal(rules.videoSource('javascript:alert(1)'),null);assert.equal(rules.videoSource('https://example.com').embed,null);assert.match(rules.videoSource('https://youtu.be/dQw4w9WgXcQ').embed,/youtube-nocookie/);
assert.equal(rules.csvCell('=HYPERLINK("bad")'),'"\'=HYPERLINK(""bad"")"');

ok('admin can block a learner',await request(owner,'member-update',{id:'learner',role:'LEARNER',blocked:true,reason:'Kiểm thử quyền truy cập'}));ok('blocked identity cannot access data',await request(learner,'state'),403);
const removeLessonDraft=ok('create draft for lesson deletion',await request(owner,'course-save',{title:'Xóa bài trong bản nháp',description:'Kiểm tra xóa một bài và sắp lại vị trí bài còn lại.',category:'Kỹ năng',level:'Nhập môn'}),201);
const la=(await request(owner,'lesson-save',{course_id:removeLessonDraft.id,title:'Bài đầu',content:'Nội dung bài đầu để xóa khỏi bản nháp.',minutes:3})).data;
const lb=(await request(owner,'lesson-save',{course_id:removeLessonDraft.id,title:'Bài sau',content:'Nội dung bài sau vẫn còn sau khi xóa.',minutes:3})).data;
const beforeDelete=(await request(owner,'courses/'+removeLessonDraft.id)).data;
ok('delete one draft lesson',await request(owner,'draft-delete',{course_id:removeLessonDraft.id,version:beforeDelete.version,lesson_id:la.id}));
const afterDelete=ok('remaining draft positions are contiguous',await request(owner,'courses/'+removeLessonDraft.id));assert.equal(afterDelete.lessons.length,1);assert.equal(afterDelete.lessons[0].id,lb.id);assert.equal(afterDelete.lessons[0].position,1);
const inactiveCourse=(await request(owner,'courses/'+categoryCourse.id)).data;
ok('inactive category permits editing its existing course',await request(owner,'course-save',{id:inactiveCourse.id,version:inactiveCourse.version,title:inactiveCourse.title,description:'Mô tả đã cập nhật, không thay danh mục đang gắn.',category:inactiveCourse.category,level:inactiveCourse.level}));
ok('malformed bank question is a validation error',await request(owner,'bank-save',{course_id:draft.id,question:null}),422);
assert.equal(rules.validQuiz([null]),false);assert.equal(rules.validQuiz([{...bq,id:''}]),false);
// Upgrade a nonempty version-one database, checking defaults and old data survive.
const legacy=new DatabaseSync(':memory:');legacy.exec('PRAGMA foreign_keys=ON');legacy.exec(readFileSync(new URL('../drizzle/'+migrationFiles[0],import.meta.url),'utf8'));
legacy.prepare('INSERT INTO members(id,name,email,created_at) VALUES(?,?,?,?)').run('legacy','Học viên cũ','old@example.test','2026-10-01');
legacy.prepare('INSERT INTO courses(id,owner_id,title,description,category,level,color,created_at) VALUES(?,?,?,?,?,?,?,?)').run('old-course','legacy','Khóa cũ','Mô tả cũ','Công nghệ','Cơ bản','mint','2026-10-01');
legacy.prepare('INSERT INTO lessons(id,course_id,title,content,position) VALUES(?,?,?,?,?)').run('old-lesson','old-course','Bài cũ','Nội dung cũ',1);
legacy.prepare('INSERT INTO enrollments VALUES(?,?,?)').run('legacy','old-course','2026-10-01');
legacy.prepare('INSERT INTO completions VALUES(?,?,?)').run('legacy','old-lesson','2026-10-01');
for(const f of migrationFiles.slice(1)){
 if(f.startsWith('0010')){
  legacy.prepare("INSERT INTO payment_orders(id,user_id,course_id,amount,status,created_at,expires_at) VALUES('legacy-paid','legacy','old-course',50000,'PAID','2026-10-01','2026-10-02')").run();
  legacy.prepare("INSERT INTO payment_orders(id,user_id,course_id,amount,created_at,expires_at) VALUES('legacy-pending','legacy','old-course',50000,'2026-10-01','2026-10-02')").run();
 }
 legacy.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
}
assert.equal(legacy.prepare("SELECT status FROM payment_orders WHERE id='legacy-paid'").get().status,'PAID');
assert.equal(legacy.prepare("SELECT status FROM payment_orders WHERE id='legacy-pending'").get().status,'CANCELLED');
assert.ok(legacy.prepare('PRAGMA table_info(payment_orders)').all().find(c=>c.name==='provider').dflt_value.includes('SIMULATED'));

assert.equal(legacy.prepare("SELECT required FROM lessons WHERE id='old-lesson'").get().required,1);
assert.equal(legacy.prepare("SELECT content FROM lessons WHERE id='old-lesson'").get().content,'Nội dung cũ');
assert.equal(legacy.prepare('SELECT count(*) n FROM completions').get().n,1);
assert.deepEqual(legacy.prepare('PRAGMA foreign_key_check').all(),[]);legacy.close();console.log('PASS nonempty v1 database migration preserves legacy data');
await runLearningChecks({request,ok,database,owner,other,planning});
await runLabChecks({request,ok,database,owner});
const completionContext=await runCompletionChecks({request,ok,database,owner,files});
await runMarketplaceChecks({request,ok,database,owner});
await runReminderChecks({request,ok,database,owner,push,reminders});
await runAdvancedChecks({request,ok,database,owner,files});
await runRelease16Checks({request,ok,database,owner,files});
assert.equal(database.prepare('SELECT count(*) n FROM push_subscriptions').get().n,0);
assert.equal(database.prepare('SELECT count(*) n FROM push_deliveries').get().n,0);
console.log('PASS full restore clears device credentials and transient push queues');
ok('full restore invalidates all password sessions',await request(null,'state',undefined,{headers:{Cookie:completionContext.cookieB}}),401);
finished=true;console.log(`\n${checks} API checks passed; grade/validation boundary checks passed.`);
database.close();delete globalThis.__mohocTest;delete globalThis.__mohocRules;delete globalThis.__mohocPlanning;delete globalThis.__mohocFeatures;delete globalThis.__mohocLearning;delete globalThis.__mohocAdvanced;
