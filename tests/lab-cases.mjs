import assert from 'node:assert/strict';
export async function runLabChecks({request,ok,database,owner}){
 const learner={userId:'lab-student',displayName:'Học viên lab',email:'lab-student@example.test'},other={userId:'lab-stranger',displayName:'Người ngoài lab',email:'lab-other@example.test'};
 for(const u of [learner,other])ok('create lab identity '+u.userId,await request(u,'state'));
 const row=(t,id)=>database.prepare(`SELECT * FROM ${t} WHERE id=?`).get(id);
 const c=ok('create lab authoring course',await request(owner,'course-save',{title:'Thực hành Python cơ bản',description:'Viết chương trình đọc dữ liệu và tính tổng',category:'Công nghệ',level:'Nhập môn'}),201);
 const lesson=ok('create Python prerequisite',await request(owner,'lesson-save',{course_id:c.id,title:'Đọc hai số nguyên',content:'Dùng input để đọc dữ liệu và print để in kết quả.',minutes:10}),201);
 const quiz=[{id:'python-q',prompt:'Hàm nào in kết quả?',options:['print','input'],correct:0,explanation:'print in kết quả.',lesson_id:lesson.id}];
 ok('save prerequisite quiz',await request(owner,'quiz-save',{course_id:c.id,version:row('courses',c.id).version,questions:quiz}));ok('publish lab course',await request(owner,'course-status',{course_id:c.id,version:row('courses',c.id).version,status:'PUBLISHED'}));
 const b={course_id:c.id,title:'Tính tổng hai số',instructions:'Đọc hai số nguyên trên một dòng, in ra tổng của chúng.',starter_code:'a, b = map(int, input().split())\n',cases:[{stdin:'2 3\n',expected_output:'5\n',hidden:false},{stdin:'120 321\n',expected_output:'441\n',hidden:true}]};
 ok('student cannot author lab',await request(learner,'lab-save',b),403);
 ok('all hidden tests rejected',await request(owner,'lab-save',{...b,cases:b.cases.map(x=>({...x,hidden:true}))}),422);
 const lab=ok('author creates lab draft',await request(owner,'lab-save',b),201);
 ok('unenrolled users cannot inspect lab',await request(learner,'course-labs/'+c.id),403);ok('enroll lab student',await request(learner,'enroll',{course_id:c.id}));
 assert.equal(ok('draft lab absent from student workspace',await request(learner,'course-labs/'+c.id)).labs.length,0);
 ok('publish lab exercise',await request(owner,'lab-status',{id:lab.id,version:1,status:'PUBLISHED'}));
 const publicLab=ok('learner sees only public examples',await request(learner,'course-labs/'+c.id));assert.equal(publicLab.labs[0].cases.length,1);assert.ok(!JSON.stringify(publicLab).includes('441'));assert.equal(publicLab.configured,false);
 ok('lab execution fails clearly without provider',await request(learner,'lab-start',{lab_id:lab.id,source_code:'print(5)',request_id:crypto.randomUUID()}),503);
 const originalFetch=globalThis.fetch;let submissions=0,config={enable_network:true,allow_enable_network:true},pollResults=[3,4],failSubmission=false;const tokens=['python-token-000001','python-token-000002'];
 globalThis.__mohocTest.env.JUDGE0_URL='https://judge.example.test';globalThis.__mohocTest.env.JUDGE0_TOKEN='test-only-private-token';
 globalThis.fetch=async(url,options={})=>{const u=new URL(url);assert.equal(u.origin,'https://judge.example.test');assert.equal(options.headers['X-Auth-Token'],'test-only-private-token');if(u.pathname==='/config_info')return Response.json(config);if(options.method==='POST'){submissions++;const payload=JSON.parse(options.body);assert.equal(payload.submissions.length,2);for(const test of payload.submissions){assert.equal(test.enable_network,false);assert.equal(test.cpu_time_limit,2);assert.equal(test.memory_limit,65536);assert.equal(test.language_id,71);assert.ok(!('callback_url' in test));}if(failSubmission)throw new Error('provider unavailable');return Response.json(tokens.map(token=>({token})),{status:201});}return Response.json({submissions:tokens.map((token,i)=>({token,status:{id:pollResults[i],description:'status'},stdout:i===1?'SECRET-EXPECTED-OUTPUT':'5\n',stderr:i===1?'SECRET-ERROR':'',time:'0.01',memory:2000}))});};
 try{
 const id=crypto.randomUUID();let r=ok('lab submits bounded programs to external runner',await request(learner,'lab-start',{lab_id:lab.id,source_code:'a,b=map(int,input().split())\nprint(a+b)',request_id:id}),201);assert.equal(r.status,'RUNNING');assert.equal(r.tokens,undefined);assert.equal(r.snapshot,undefined);
 assert.equal(ok('network retry reuses request id without resubmission',await request(learner,'lab-start',{lab_id:lab.id,source_code:'print(5)',request_id:id})).id,r.id);assert.equal(submissions,1);
 assert.equal(ok('one active lab run per student and exercise',await request(learner,'lab-start',{lab_id:lab.id,source_code:'print(5)',request_id:crypto.randomUUID()})).id,r.id);assert.equal(submissions,1);
 ok('stranger cannot read source or results',await request(other,'lab-run/'+r.id),404);
 database.prepare('UPDATE lab_runs SET updated_at=? WHERE id=?').run(new Date(Date.now()-5000).toISOString(),r.id);
 r=ok('lab polls async batch and grades test statuses',await request(learner,'lab-refresh',{id:r.id}));assert.equal(r.status,'COMPLETED');assert.equal(r.score,50);assert.equal(r.results[0].output,'5\n');assert.equal(r.results[1].output,undefined);assert.ok(!JSON.stringify(r).includes('SECRET'));assert.ok(!JSON.stringify(r).includes('441'));
 const stored=ok('completed lab result can be reloaded',await request(learner,'lab-run/'+r.id));assert.equal(stored.source_code,'a,b=map(int,input().split())\nprint(a+b)');
 pollResults=[1,2];let second=ok('new run after completion',await request(learner,'lab-start',{lab_id:lab.id,source_code:'print(5)',request_id:crypto.randomUUID()}),201);database.prepare('UPDATE lab_runs SET updated_at=? WHERE id=?').run(new Date(Date.now()-5000).toISOString(),second.id);
 second=ok('queued runner results stay pending',await request(learner,'lab-refresh',{id:second.id}));assert.equal(second.status,'RUNNING');assert.equal(second.score,null);
 database.prepare('UPDATE lab_runs SET expires_at=? WHERE id=?').run(new Date(Date.now()-1000).toISOString(),second.id);assert.equal(ok('stale lab run times out',await request(learner,'lab-refresh',{id:second.id})).status,'TIMED_OUT');
 // Move prior runs outside the minute limiter to exercise provider failures independently.
 database.prepare('UPDATE lab_runs SET created_at=? WHERE user_id=?').run(new Date(Date.now()-120000).toISOString(),learner.userId);
 config={enable_network:true,allow_enable_network:false};ok('runner that cannot disable networking is rejected',await request(learner,'lab-start',{lab_id:lab.id,source_code:'print(5)',request_id:crypto.randomUUID()}),503);
 config={enable_network:false,allow_enable_network:false};failSubmission=true;const failedId=crypto.randomUUID();ok('provider failures become explicit failed runs',await request(learner,'lab-start',{lab_id:lab.id,source_code:'print(5)',request_id:failedId}),503);assert.equal(row('lab_runs',failedId).status,'FAILED');
 const current=row('lab_exercises',lab.id);ok('archive lab without deleting student history',await request(owner,'lab-status',{id:lab.id,version:current.version,status:'ARCHIVED'}));ok('archived lab cannot start new run',await request(learner,'lab-start',{lab_id:lab.id,source_code:'print(5)',request_id:crypto.randomUUID()}),403);ok('archived completed lab history remains private and readable',await request(learner,'lab-run/'+id));
 }finally{globalThis.fetch=originalFetch;delete globalThis.__mohocTest.env.JUDGE0_URL;delete globalThis.__mohocTest.env.JUDGE0_TOKEN;}
 console.log('PASS isolated runner adapter, no-network limits, hidden tests and private lab history');
}
