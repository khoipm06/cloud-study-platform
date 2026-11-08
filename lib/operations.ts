import {authRuntimeCheck} from './auth-services';
import {scanPendingFiles} from './social-services';
import {syncLearningNotifications} from './learning-services';
import {expireMentorBookings} from './advanced-services';
import {dispatchStudyPush} from './reminder-services';
import {pushRuntimeCheck} from './web-push';
import {emailConfiguration} from './email-delivery';
export const BACKUP_TABLES=['settings','members','auth_accounts','auth_recovery_codes','categories','courses','lessons','enrollments','completions','notes','question_bank','quiz_revisions','course_quizzes','named_quiz_revisions','attempts','active_attempts','named_quiz_attempts','materials','retired_objects','learning_preferences','learning_goals','study_sessions','discussion_posts','discussion_comments','discussion_reports','learning_notifications','mentor_profiles','mentor_slots','mentor_bookings','mentor_feedback','lab_exercises','lab_runs','payment_orders','certificates','conversations','direct_messages','conversation_blocks','community_files','auth_email_verifications','tutor_threads','tutor_messages','course_review_events','wallet_transactions'];
export const BACKUP_SCHEMA_VERSION=4;
const encoder=new TextEncoder(),decoder=new TextDecoder();
function base64(bytes:Uint8Array){let result='';for(let i=0;i<bytes.length;i+=8192)result+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(result);}
function unbase64(text:string){return Uint8Array.from(atob(text),x=>x.charCodeAt(0));}
async function sha(bytes:ArrayBuffer|Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource))).map(n=>n.toString(16).padStart(2,'0')).join('');}
async function backupKey(s:any){if(!s.env.BACKUP_ENCRYPTION_KEY)s.fail(503,'Chưa cấu hình khóa mã hóa bản sao lưu.');try{const bytes=unbase64(s.env.BACKUP_ENCRYPTION_KEY);if(bytes.length!==32)throw new Error();return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);}catch{return s.fail(503,'Cấu hình mã hóa bản sao lưu không hợp lệ.');}}
async function encryptBytes(s:any,bytes:ArrayBuffer|Uint8Array){const key=await backupKey(s),iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode('mohoc-backup-v1')},key,bytes as BufferSource));const output=new Uint8Array(12+encrypted.byteLength);output.set(iv);output.set(encrypted,12);return output;}
async function decryptBytes(s:any,bytes:ArrayBuffer){const input=new Uint8Array(bytes);if(input.length<28)s.fail(422,'Tệp sao lưu không hợp lệ.');const key=await backupKey(s);try{return await crypto.subtle.decrypt({name:'AES-GCM',iv:input.slice(0,12),additionalData:encoder.encode('mohoc-backup-v1')},key,input.slice(12));}catch{return s.fail(422,'Không giải mã được bản sao lưu hoặc dữ liệu không toàn vẹn.');}}
async function encrypt(s:any,value:any){return encryptBytes(s,encoder.encode(JSON.stringify(value)));}
async function decrypt(s:any,bytes:ArrayBuffer){try{return JSON.parse(decoder.decode(await decryptBytes(s,bytes)));}catch{return s.fail(422,'Không giải mã được bản sao lưu hoặc dữ liệu không toàn vẹn.');}}
async function lease(s:any,key:string){const token=s.uid(),expires=new Date(Date.now()+10*60000).toISOString();const r=await s.run(`INSERT INTO operation_leases(key,token,expires_at) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM operation_leases WHERE ?='restore' AND key LIKE 'request:%' AND expires_at>?) ON CONFLICT(key) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE operation_leases.expires_at<=?`,key,token,expires,key,s.now(),s.now());if(!r.meta.changes)s.fail(409,'Một tác vụ vận hành đang chạy. Hãy thử lại sau.');return async()=>{await s.run('DELETE FROM operation_leases WHERE key=? AND token=?',key,token);};}
async function schema(s:any){const result:Record<string,string[]>={};const values=await s.db().batch(BACKUP_TABLES.map(t=>s.statement(`PRAGMA table_info(${t})`)));BACKUP_TABLES.forEach((t,i)=>result[t]=values[i].results.map((c:any)=>c.name));return result;}
function validObjectKey(key:any){return typeof key==='string'&&/^(materials|community)\/[a-zA-Z0-9_-]+$/.test(key);}
async function validateSnapshot(s:any,snapshot:any,storedVersion?:number){
 const current=await schema(s);
 if(snapshot?.format!==1||!snapshot.columns||!snapshot.tables||!Array.isArray(snapshot.files)||snapshot.files.length>100)s.fail(422,'Định dạng bản sao lưu không hợp lệ.');
 const version=storedVersion??snapshot.schema_version??3;
 if(!Number.isInteger(version)||version<1||version>BACKUP_SCHEMA_VERSION)s.fail(422,'Phiên bản bản sao lưu không được hỗ trợ.');
 const optional=['auth_email_verifications','tutor_threads','tutor_messages'];
 if(version<4)optional.push('course_review_events','wallet_transactions');
 for(const t of optional)if(!(t in snapshot.columns)&&!(t in snapshot.tables)){snapshot.columns[t]=current[t];snapshot.tables[t]=[];}
 if(Object.keys(snapshot.columns).length!==BACKUP_TABLES.length||BACKUP_TABLES.some(t=>JSON.stringify(snapshot.columns[t])!==JSON.stringify(current[t])))s.fail(422,'Schema khác phiên bản hiện tại; cần chuyển đổi bản sao lưu trước khi khôi phục.');
 let count=0;for(const t of BACKUP_TABLES){if(!Array.isArray(snapshot.tables[t]))s.fail(422,'Bản sao lưu thiếu bảng dữ liệu.');count+=snapshot.tables[t].length;}
 if(count>3000)s.fail(422,'Bản sao lưu vượt giới hạn 3.000 bản ghi.');
 for(const member of snapshot.tables.members)if(member.role!=='ADMIN')member.role='LEARNER';
 snapshot.schema_version=BACKUP_SCHEMA_VERSION;
 const owner=await s.one("SELECT value FROM settings WHERE key='owner'");
 if(!snapshot.tables.settings.some((r:any)=>r.key==='owner'&&r.value===owner?.value)||!snapshot.tables.members.some((r:any)=>r.id===owner?.value&&r.role==='ADMIN'&&!r.blocked))s.fail(422,'Bản sao lưu không giữ được quyền quản trị hiện tại.');
 const keys=new Set<string>();for(const f of snapshot.files){if(!validObjectKey(f.key)||keys.has(f.key)||!Number.isSafeInteger(f.size)||f.size<0||f.size>10*1024*1024||!/^[a-f0-9]{64}$/.test(f.sha256))s.fail(422,'Mô tả học liệu trong bản sao lưu không hợp lệ.');keys.add(f.key);}
 const referenced=new Set([...snapshot.tables.materials,...snapshot.tables.retired_objects,...snapshot.tables.community_files].map((f:any)=>f.object_key));
 if(referenced.size!==keys.size||Array.from(referenced).some(k=>!keys.has(k as string)))s.fail(422,'Danh sách học liệu không khớp dữ liệu sao lưu.');
 return snapshot;
}
export async function createBackup(s:any,u:any){
 await backupKey(s);const id=s.uid();await s.run("INSERT INTO backups(id,created_by,status,created_at,schema_version) VALUES(?,?,'RUNNING',?,?)",id,u.id,s.now(),BACKUP_SCHEMA_VERSION);
 try{const columns=await schema(s);const sizes=await s.db().batch(BACKUP_TABLES.map(t=>s.statement(`SELECT count(*) n,coalesce(sum(${columns[t].map(c=>'coalesce(length("'+c+'"),0)').join('+')}),0) bytes FROM ${t}`)));if(sizes.reduce((n:number,r:any)=>n+r.results[0].n,0)>3000||sizes.reduce((n:number,r:any)=>n+r.results[0].bytes,0)>8*1024*1024)s.fail(422,'Dữ liệu vượt giới hạn sao lưu đồ án (3.000 bản ghi hoặc 8 MiB metadata).');const results=await s.db().batch(BACKUP_TABLES.map(t=>s.statement(`SELECT * FROM ${t}`)));const tables:Record<string,any[]>={};let records=0;BACKUP_TABLES.forEach((t,i)=>{tables[t]=results[i].results;records+=tables[t].length;});if(records>3000)s.fail(422,'Bản sao lưu của đồ án giới hạn 3.000 bản ghi; cần quy trình export riêng cho dữ liệu lớn hơn.');
 const keys=Array.from(new Set([...tables.materials.map(x=>x.object_key),...tables.retired_objects.map(x=>x.object_key),...tables.community_files.map(x=>x.object_key)]));if(keys.length>100)s.fail(422,'Bản sao lưu này giới hạn 100 tệp.');const files=[];
 for(const key of keys){if(!validObjectKey(key))s.fail(422,'Khóa học liệu không hợp lệ.');const original=await s.env.BUCKET.get(key);if(!original)s.fail(409,'Có học liệu thiếu object; hãy đối soát trước khi sao lưu.');const data=await original.arrayBuffer();if(data.byteLength>10*1024*1024)s.fail(422,'Tệp vượt giới hạn sao lưu 10 MiB.');const backup_key=`backups/${id}/files/${key}`;await s.env.BUCKET.put(backup_key,await encryptBytes(s,data),{httpMetadata:{contentType:'application/octet-stream'}});files.push({key,backup_key,size:data.byteLength,sha256:await sha(data)});}
 const snapshot={format:1,schema_version:BACKUP_SCHEMA_VERSION,created_at:s.now(),columns,tables,files};if(encoder.encode(JSON.stringify(snapshot)).byteLength>8*1024*1024)s.fail(422,'Metadata sao lưu vượt 8 MiB.');const bytes=await encrypt(s,snapshot),object_key=`backups/${id}/snapshot.enc`,hash=await sha(bytes);await s.env.BUCKET.put(object_key,bytes,{httpMetadata:{contentType:'application/octet-stream'}});await s.run("UPDATE backups SET status='READY',object_key=?,manifest_hash=?,file_count=?,record_count=?,completed_at=? WHERE id=?",object_key,hash,files.length,records,s.now(),id);await s.log(u,'Tạo bản sao lưu mã hóa',id);return {id,file_count:files.length,record_count:records};
 }catch(e){await s.run("UPDATE backups SET status='FAILED',message=?,completed_at=? WHERE id=?",e instanceof Error?e.message.slice(0,500):'Lỗi sao lưu',s.now(),id);throw e;}
}
async function loadBackup(s:any,id:string){const b=await s.one("SELECT * FROM backups WHERE id=? AND status='READY'",id);if(!b)s.fail(404,'Không tìm thấy bản sao lưu sẵn sàng.');const object=await s.env.BUCKET.get(b.object_key);if(!object)s.fail(404,'Thiếu tệp sao lưu.');const bytes=await object.arrayBuffer();if(await sha(bytes)!==b.manifest_hash)s.fail(422,'Checksum bản sao lưu không khớp.');const snapshot=await validateSnapshot(s,await decrypt(s,bytes),b.schema_version);
 for(const f of snapshot.files){if(!validObjectKey(f.key)||f.backup_key!==`backups/${id}/files/${f.key}`)s.fail(422,'Tham chiếu tệp sao lưu không hợp lệ.');if(!await s.env.BUCKET.head(f.backup_key))s.fail(422,'Bản sao lưu thiếu học liệu.');}
 return {backup:b,snapshot};
}
export async function operationsTick(s:any,u:any,backupIfDue=true){const release=await lease(s,'operations');const runId=s.uid();let summary:any={};try{
 const users=await s.all(`SELECT DISTINCT m.id,m.role FROM members m JOIN study_sessions x ON x.user_id=m.id JOIN learning_goals g ON g.id=x.goal_id JOIN courses c ON c.id=x.course_id LEFT JOIN learning_preferences p ON p.user_id=m.id WHERE m.blocked=0 AND x.status='PLANNED' AND g.status='ACTIVE' AND c.hidden=0 AND (p.reminders_enabled IS NULL OR p.reminders_enabled=1) AND x.reminder_at<=? AND x.starts_at>? AND NOT EXISTS(SELECT 1 FROM learning_notifications n WHERE n.dedupe_key='study:'||x.id||':'||x.reminder_at AND n.invalidated=0) LIMIT 100`,s.now(),new Date(Date.now()-86400000).toISOString());
 await s.run("DELETE FROM operation_leases WHERE key LIKE 'request:%' AND expires_at<=?",s.now());const before=(await s.one("SELECT count(*) n FROM learning_notifications WHERE kind='STUDY'")).n;for(const person of users)await syncLearningNotifications(s,person);summary.reminders_created=(await s.one("SELECT count(*) n FROM learning_notifications WHERE kind='STUDY'")).n-before;summary.bookings_expired=await expireMentorBookings(s);
 const cutoff=new Date(Date.now()-7*86400000).toISOString();let removed=0;for(const f of await s.all("SELECT id,object_key FROM materials WHERE status='DETACHED' AND detached_at<=? LIMIT 30",cutoff)){await s.env.BUCKET.delete(f.object_key);await s.run("DELETE FROM materials WHERE id=? AND status='DETACHED' AND detached_at<=?",f.id,cutoff);removed++;}for(const f of await s.all('SELECT object_key FROM retired_objects WHERE delete_after<=? LIMIT 30',s.now())){await s.env.BUCKET.delete(f.object_key);await s.run('DELETE FROM retired_objects WHERE object_key=?',f.object_key);removed++;}for(const f of await s.all("SELECT id,object_key FROM community_files WHERE (status='DETACHED' AND detached_at<=?) OR (status='REJECTED' AND created_at<=?) LIMIT 30",cutoff,cutoff)){await s.env.BUCKET.delete(f.object_key);await s.run('DELETE FROM community_files WHERE id=?',f.id);removed++;}summary.files_deleted=removed;summary.scanner=await scanPendingFiles(s);await s.run('DELETE FROM auth_sessions WHERE expires_at<=?',s.now());await s.run('DELETE FROM auth_rate_limits WHERE expires_at<=?',s.now());await s.run('DELETE FROM email_tokens WHERE expires_at<=? OR used_at IS NOT NULL',s.now());
 summary.push=await dispatchStudyPush(s);
 if(backupIfDue&&s.env.BACKUP_ENCRYPTION_KEY&&!await s.one("SELECT 1 FROM backups WHERE status='READY' AND schema_version=? AND created_at>=? LIMIT 1",BACKUP_SCHEMA_VERSION,new Date().toISOString().slice(0,10)+'T00:00:00.000Z'))summary.backup=await createBackup(s,u);
 for(const old of await s.all("SELECT id FROM backups WHERE ((status='FAILED' AND created_at<?) OR (status='READY' AND created_at<?)) AND id NOT IN(SELECT id FROM backups WHERE status='READY' ORDER BY created_at DESC LIMIT 7) LIMIT 3",new Date(Date.now()-86400000).toISOString(),new Date(Date.now()-7*86400000).toISOString())){const objects=await s.env.BUCKET.list({prefix:'backups/'+old.id+'/',limit:1000});if(objects.objects.length)await s.env.BUCKET.delete(objects.objects.map((x:any)=>x.key));await s.run('DELETE FROM restore_previews WHERE backup_id=?',old.id);await s.run('DELETE FROM backups WHERE id=?',old.id);}
 await s.run('INSERT INTO operation_runs VALUES(?,?,?,?,?)',runId,u.id,'SUCCEEDED',JSON.stringify(summary),s.now());return summary;
 }catch(e){await s.run('INSERT INTO operation_runs VALUES(?,?,?,?,?)',runId,u.id,'FAILED',JSON.stringify({message:e instanceof Error?e.message.slice(0,500):'Tác vụ lỗi'}),s.now());throw e;}finally{await release();}}
export async function operationsRead(s:any,req:Request,path:string[],u:any){if(!['operations','backup-download','backup-export'].includes(path[0]))return null;if(u.role!=='ADMIN')s.fail(403,'Chỉ quản trị viên được vận hành dữ liệu.');
 if(path[0]==='backup-export')return portableBackupExport(s,u,path[1]);
 if(path[0]==='backup-download'){const b=await s.one("SELECT * FROM backups WHERE id=? AND status='READY'",path[1]);if(!b)s.fail(404,'Không tìm thấy bản sao lưu.');const obj=await s.env.BUCKET.get(b.object_key);if(!obj)s.fail(404,'Thiếu tệp sao lưu.');return new Response(obj.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="cloud-study-${b.id}.enc"`,'Cache-Control':'no-store'}});}
 const featureTables=await s.all("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('auth_email_verifications','email_tokens','tutor_threads','tutor_messages') ORDER BY name");
 return s.json({feature_schema:{ready:featureTables.length===4,tables:featureTables.map((t:any)=>t.name)},email_configured:emailConfiguration(s.env),ai_configured:false,backup_schema_version:BACKUP_SCHEMA_VERSION,push_queue:await s.all('SELECT status,count(*) count FROM push_deliveries GROUP BY status'),push_runtime:await pushRuntimeCheck(s.env),push_configured:!!(s.env.VAPID_PRIVATE_JWK&&s.env.VAPID_SUBJECT),can_restore:u.id===(await s.one("SELECT value FROM settings WHERE key='owner'"))?.value,backup_configured:!!s.env.BACKUP_ENCRYPTION_KEY,lab_configured:!!s.env.JUDGE0_URL,scanner_configured:!!s.env.AV_SCAN_URL,runs:await s.all('SELECT * FROM operation_runs ORDER BY created_at DESC LIMIT 20'),backups:await s.all('SELECT id,status,schema_version,file_count,record_count,message,created_at,completed_at FROM backups ORDER BY created_at DESC LIMIT 20'),auth_runtime:await authRuntimeCheck(),health:{database:!!await s.one('SELECT 1 ok'),storage:!!s.env.BUCKET}});
}
export async function operationsWrite(s:any,path:string[],u:any,b:any){if(!['operations-run','backup-create','backup-preview','backup-restore'].includes(path[0]))return null;if(u.role!=='ADMIN')s.fail(403,'Chỉ quản trị viên được vận hành dữ liệu.');
 if(path[0]==='operations-run')return s.json(await operationsTick(s,u,b.backup_if_due!==false));
 if(path[0]==='backup-create'){const release=await lease(s,'operations');try{return s.json(await createBackup(s,u),201);}finally{await release();}}
 if(path[0]==='backup-preview'){const {backup,snapshot}=await loadBackup(s,s.str(b.id));const id=s.uid();await s.run('INSERT INTO restore_previews(id,user_id,backup_id,manifest_hash,expires_at) VALUES(?,?,?,?,?)',id,u.id,backup.id,backup.manifest_hash,new Date(Date.now()+600000).toISOString());return s.json({preview_id:id,backup_id:backup.id,created_at:snapshot.created_at,tables:BACKUP_TABLES.map(t=>({table:t,count:snapshot.tables[t].length})),file_count:snapshot.files.length,confirmation:'KHOI PHUC'});}
 if(u.id!==(await s.one("SELECT value FROM settings WHERE key='owner'"))?.value)s.fail(403,'Chỉ chủ nền tảng được khôi phục toàn bộ dữ liệu.');
 const release=await lease(s,'operations');let releaseRestore=async()=>{};const addedKeys:string[]=[];let committed=false;try{releaseRestore=await lease(s,'restore');
 const preview=await s.one('SELECT * FROM restore_previews WHERE id=? AND user_id=? AND used=0 AND expires_at>?',s.str(b.preview_id),u.id,s.now());if(!preview||b.confirmation!=='KHOI PHUC')s.fail(409,'Cần xem trước bản sao lưu và nhập KHOI PHUC trong vòng 10 phút.');const {backup,snapshot}=await loadBackup(s,preview.backup_id);if(backup.manifest_hash!==preview.manifest_hash)s.fail(409,'Bản sao lưu đã thay đổi.');
 const currentKeys=await s.all('SELECT object_key FROM materials UNION SELECT object_key FROM retired_objects UNION SELECT object_key FROM community_files');
 for(const f of snapshot.files){const obj=await s.env.BUCKET.get(f.backup_key);const bytes=await decryptBytes(s,await obj.arrayBuffer());if(await sha(bytes)!==f.sha256)s.fail(422,'Checksum học liệu không khớp.');const existing=await s.env.BUCKET.get(f.key);if(existing){if(await sha(await existing.arrayBuffer())!==f.sha256)s.fail(409,'Học liệu hiện tại sai checksum; cần đối soát trước khi khôi phục.');}else{addedKeys.push(f.key);await s.env.BUCKET.put(f.key,bytes);}}
 const commands=[s.statement('PRAGMA defer_foreign_keys = ON'),s.statement('DELETE FROM auth_sessions'),s.statement('DELETE FROM email_tokens'),s.statement('DELETE FROM push_deliveries'),s.statement('DELETE FROM push_subscriptions'),s.statement('DELETE FROM restore_previews WHERE id<>?',preview.id),s.statement('UPDATE restore_previews SET used=1 WHERE id=? AND user_id=? AND used=0',preview.id,u.id),...BACKUP_TABLES.slice().reverse().map(t=>s.statement(`DELETE FROM ${t}`))];
 for(const table of BACKUP_TABLES){const columns=snapshot.columns[table];const size=Math.max(1,Math.floor(90/columns.length));for(let offset=0;offset<snapshot.tables[table].length;offset+=size){const rows=snapshot.tables[table].slice(offset,offset+size);commands.push(s.statement(`INSERT INTO ${table} (${columns.map((c:string)=>'"'+c+'"').join(',')}) VALUES ${rows.map(()=>`(${columns.map(()=>'?').join(',')})`).join(',')}`,...rows.flatMap((r:any)=>columns.map((c:string)=>r[c]??null))));}}
 const keys=new Set(snapshot.files.map((f:any)=>f.key));for(const r of currentKeys)if(validObjectKey(r.object_key)&&!keys.has(r.object_key))commands.push(s.statement('INSERT OR IGNORE INTO retired_objects VALUES(?,?)',r.object_key,new Date(Date.now()+7*86400000).toISOString()));
 commands.push(s.statement('INSERT INTO audit(id,actor_id,action,resource,created_at,reason,request_id) VALUES(?,?,?,?,?,?,?)',s.uid(),u.id,'Khôi phục dữ liệu từ bản sao lưu',backup.id,s.now(),'Đã xác nhận qua bản xem trước',s.uid()),s.statement('PRAGMA defer_foreign_keys = OFF'));await s.db().batch(commands);committed=true;return s.json({ok:true,backup_id:backup.id});
 }catch(e){if(!committed)for(const key of addedKeys)await s.env.BUCKET.delete(key);throw e;}finally{await releaseRestore();await release();}
}

const PORTABLE_MAGIC=encoder.encode('MOHOC-BACKUP-1\n');
const PORTABLE_LIMIT=128*1024*1024;
// The archive is a bounded, streamed envelope of the already encrypted snapshot and objects.
async function portableBackupExport(s:any,u:any,id:string){
 const release=await lease(s,'operations');
 try{
  const {snapshot}=await loadBackup(s,s.str(id));const encrypted=await encrypt(s,snapshot);
  const descriptors=[];for(const f of snapshot.files){const obj=await s.env.BUCKET.head(f.backup_key);if(!obj||obj.size!==f.size+28)s.fail(422,'Bản sao lưu thiếu học liệu hoặc có kích thước sai.');descriptors.push({key:f.key,length:obj.size});}
  const header=encoder.encode(JSON.stringify({format:'mohoc-portable-v1',snapshot_length:encrypted.byteLength,files:descriptors}));
  const total=PORTABLE_MAGIC.length+4+header.length+encrypted.length+descriptors.reduce((n,x)=>n+x.length,0);
  if(total>PORTABLE_LIMIT)s.fail(413,'Gói sao lưu di chuyển tối đa 128 MiB.');
  const prefix=new Uint8Array(PORTABLE_MAGIC.length+4+header.length);prefix.set(PORTABLE_MAGIC);new DataView(prefix.buffer).setUint32(PORTABLE_MAGIC.length,header.length);prefix.set(header,PORTABLE_MAGIC.length+4);
  async function* chunks(){yield prefix;yield encrypted;for(const f of snapshot.files){const object=await s.env.BUCKET.get(f.backup_key);if(!object)throw new Error('Thiếu học liệu trong bản sao lưu.');const bytes=await object.arrayBuffer();if(bytes.byteLength!==f.size+28)throw new Error('Kích thước học liệu sao lưu đã thay đổi.');yield new Uint8Array(bytes);}}
  const iterator=chunks();let finished=false;
  const finish=async()=>{if(!finished){finished=true;await release();}};
  const body=new ReadableStream<Uint8Array>({async pull(controller){try{const next=await iterator.next();if(next.done){await finish();controller.close();}else controller.enqueue(next.value);}catch(e){await finish();controller.error(e);}},async cancel(){await iterator.return(undefined);await finish();}});
  await s.log(u,'Xuất gói sao lưu mã hóa đầy đủ',id);
  return new Response(body,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(total),'Content-Disposition':`attachment; filename="cloud-study-${id}.mohoc"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){await release();throw e;}
}
export async function portableBackupImport(s:any,req:Request,u:any){
 if(u.role!=='ADMIN'||u.id!==(await s.one("SELECT value FROM settings WHERE key='owner'"))?.value)s.fail(403,'Chỉ chủ nền tảng được nhập bản sao lưu.');
 if(req.headers.get('content-type')?.split(';')[0]!=='application/octet-stream')s.fail(415,'Hãy gửi gói sao lưu nhị phân .mohoc.');
 if(Number(req.headers.get('content-length')||0)>PORTABLE_LIMIT)s.fail(413,'Gói sao lưu tối đa 128 MiB.');
 if(!req.body)s.fail(422,'Gói sao lưu rỗng.');
 await backupKey(s);const release=await lease(s,'operations'),reader=req.body!.getReader();let carry=new Uint8Array(0),offset=0,received=0,id='';const added:string[]=[];
 async function readBytes(size:number){
  const out=new Uint8Array(size);let written=0;
  while(written<size){if(offset===carry.length){const next=await reader.read();if(next.done){s.fail(422,'Gói sao lưu bị cắt ngắn.');throw new Error('Unreachable');}carry=next.value;offset=0;received+=carry.length;if(received>PORTABLE_LIMIT)s.fail(413,'Gói sao lưu tối đa 128 MiB.');}
   const length=Math.min(size-written,carry.length-offset);out.set(carry.subarray(offset,offset+length),written);offset+=length;written+=length;}
  return out;
 }
 try{
  if(decoder.decode(await readBytes(PORTABLE_MAGIC.length))!==decoder.decode(PORTABLE_MAGIC))s.fail(422,'Không đúng định dạng gói sao lưu Cloud study platform.');
  const lengthBytes=await readBytes(4),length=new DataView(lengthBytes.buffer).getUint32(0);if(!length||length>65536)s.fail(422,'Mô tả gói sao lưu quá lớn.');
  let header:any;try{header=JSON.parse(decoder.decode(await readBytes(length)));}catch(e){if((e as any)?.status)throw e;s.fail(422,'Mô tả gói sao lưu không hợp lệ.');}
  if(header?.format!=='mohoc-portable-v1'||!Number.isSafeInteger(header.snapshot_length)||header.snapshot_length<28||header.snapshot_length>8*1024*1024+28||!Array.isArray(header.files)||header.files.length>100)s.fail(422,'Mô tả gói sao lưu không hợp lệ.');
  const metadata=await readBytes(header.snapshot_length),snapshot=await validateSnapshot(s,await decrypt(s,metadata.buffer));
  if(header.files.length!==snapshot.files.length||header.files.some((f:any,i:number)=>f.key!==snapshot.files[i].key||f.length!==snapshot.files[i].size+28))s.fail(422,'Mô tả gói không khớp nội dung mã hóa.');
  const total=PORTABLE_MAGIC.length+4+length+header.snapshot_length+header.files.reduce((n:number,f:any)=>n+f.length,0);if(total>PORTABLE_LIMIT)s.fail(413,'Gói sao lưu tối đa 128 MiB.');
  id=s.uid();await s.run("INSERT INTO backups(id,created_by,status,created_at,schema_version) VALUES(?,?,'RUNNING',?,?)",id,u.id,s.now(),BACKUP_SCHEMA_VERSION);
  for(const f of snapshot.files){const bytes=await readBytes(f.size+28),plain=await decryptBytes(s,bytes.buffer);if(plain.byteLength!==f.size||await sha(plain)!==f.sha256)s.fail(422,'Học liệu trong gói sao lưu không toàn vẹn.');f.backup_key=`backups/${id}/files/${f.key}`;added.push(f.backup_key);await s.env.BUCKET.put(f.backup_key,bytes,{httpMetadata:{contentType:'application/octet-stream'}});}
  if(offset<carry.length||!(await reader.read()).done)s.fail(422,'Gói sao lưu có dữ liệu dư.');
  const bytes=await encrypt(s,snapshot),objectKey=`backups/${id}/snapshot.enc`;added.push(objectKey);await s.env.BUCKET.put(objectKey,bytes,{httpMetadata:{contentType:'application/octet-stream'}});
  const records=BACKUP_TABLES.reduce((n,t)=>n+snapshot.tables[t].length,0);
  await s.run("UPDATE backups SET status='READY',object_key=?,manifest_hash=?,file_count=?,record_count=?,completed_at=? WHERE id=?",objectKey,await sha(bytes),snapshot.files.length,records,s.now(),id);
  await s.log(u,'Nhập gói sao lưu mã hóa (chưa khôi phục dữ liệu)',id);
  return s.json({id,status:'READY',file_count:snapshot.files.length,record_count:records,message:'Đã nhập bản sao lưu. Dữ liệu đang hoạt động chưa thay đổi; xem trước trước khi khôi phục.'},201);
 }catch(e){for(const key of added)await s.env.BUCKET.delete(key);if(id)await s.run("UPDATE backups SET status='FAILED',message=?,completed_at=? WHERE id=?",e instanceof Error?e.message.slice(0,500):'Lỗi nhập bản sao lưu',s.now(),id);throw e;
 }finally{await reader.cancel().catch(()=>{});await release();}
}
