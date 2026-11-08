'use client';
import {useEffect,useRef,useState} from 'react';
import {BookOpen,MessageCircle,Plus,Send,Trash2,RefreshCw} from 'lucide-react';
import {featureApi as api} from './features-client';
import {Dialog} from './dialog';

export function TutorChat({course}:{course:any}){
 const [threads,setThreads]=useState<any[]>([]),[data,setData]=useState<any>(null),[question,setQuestion]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[deleting,setDeleting]=useState(false);
 const lock=useRef(false),sequence=useRef(0),pending=useRef<{question:string;id:string}|null>(null),end=useRef<HTMLDivElement>(null);
 const load=async()=>{const r=await api('tutor-threads?course_id='+encodeURIComponent(course.id));setThreads(r.threads);};
 useEffect(()=>{let live=true;sequence.current++;setData(null);setThreads([]);setQuestion('');setError('');pending.current=null;api('tutor-threads?course_id='+encodeURIComponent(course.id)).then(r=>{if(live)setThreads(r.threads);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;sequence.current++;};},[course.id]);
 useEffect(()=>{end.current?.scrollIntoView({block:'nearest'});},[data?.messages?.length]);
 const run=async(fn:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await fn();}catch(e:any){setError(e.message);}finally{lock.current=false;setBusy(false);}};
 const select=async(id:string)=>{const n=++sequence.current;const r=await api('tutor-thread/'+encodeURIComponent(id));if(n===sequence.current){setData(r);setQuestion('');pending.current=null;}};
 const send=async()=>{
  const text=question.trim();if(text.length<2)return;
  let current=data;if(!current){current=await api('tutor-create',{course_id:course.id});setData(current);}
  if(!pending.current||pending.current.question!==text)pending.current={question:text,id:crypto.randomUUID()};
  const r=await api('tutor-message',{thread_id:current.thread.id,version:current.thread.version,question:text,request_id:pending.current.id});
  setData(r);setQuestion('');pending.current=null;await load();
 };
 return <section className="panel section tutor-panel"><div className="panel-heading"><div><h2><MessageCircle size={19}/> Hỏi học liệu</h2><p className="form-help">Trò chuyện để tìm trích đoạn trong bài đọc. Lịch sử chỉ mình bạn xem được.</p></div><span className="tag neutral">Tra cứu có nguồn</span></div>
  <div className="tutor-layout"><aside className="tutor-sidebar"><button className="btn secondary" disabled={busy} onClick={()=>run(async()=>{setData(await api('tutor-create',{course_id:course.id}));pending.current=null;setQuestion('');await load();})}><Plus size={15}/> Cuộc trò chuyện mới</button><div className="tutor-threads" aria-label="Lịch sử hỏi học liệu">{threads.map(t=><button key={t.id} disabled={busy} className={'tutor-thread '+(data?.thread.id===t.id?'selected':'')} onClick={()=>run(()=>select(t.id))}>{t.title}</button>)}{!threads.length&&<p className="form-help">Câu hỏi và nguồn sẽ được lưu khi bạn bắt đầu.</p>}</div></aside>
   <div className="tutor-main"><p className="learning-notice">Hiện trả lời bằng trích đoạn từ bài đọc; chưa có mô hình AI sinh câu trả lời. PDF, ảnh và lời thoại video chưa nằm trong phạm vi tra cứu.</p>
    {error&&<div className="alert" role="alert">{error} {data&&<button className="text-btn" disabled={busy} onClick={()=>run(()=>select(data.thread.id))}><RefreshCw size={14}/> Tải lại hội thoại</button>}</div>}
    <div className="tutor-log" role="log" aria-label="Nội dung hỏi học liệu" aria-live="polite">{!data?.messages.length&&<div className="tutor-empty"><BookOpen size={28}/><p>Nhập một khái niệm trong khóa học, ví dụ “biến lưu dữ liệu như thế nào?”.</p></div>}{data?.total>40&&<p className="form-help">Hiển thị 40 lượt gần nhất trong {data.total} lượt.</p>}{data?.messages.map((m:any)=><article className="tutor-turn" key={m.id}><div className="tutor-question"><b>Bạn</b><p>{m.question}</p></div><div className="tutor-answer"><b>Trợ lý học liệu</b><p>{m.answer}</p>{m.citations.map((c:any,i:number)=><blockquote key={c.lesson_id+'-'+c.paragraph}><p>{c.excerpt}</p><button className="text-btn" onClick={()=>{window.location.hash=`learn/${c.course_id}/${c.lesson_id}`;}}><BookOpen size={14}/> [{i+1}] {c.lesson_title} · Đoạn {c.paragraph}</button></blockquote>)}</div></article>)}<div ref={end}/></div>
    <form className="tutor-compose" onSubmit={e=>{e.preventDefault();run(send);}}><label className="sr-only" htmlFor={'tutor-question-'+course.id}>Câu hỏi về học liệu</label><textarea id={'tutor-question-'+course.id} value={question} disabled={busy} onChange={e=>setQuestion(e.target.value)} required minLength={2} maxLength={2000} rows={2} placeholder="Bạn muốn tìm hiểu khái niệm nào?"/><button className="btn primary" disabled={busy||question.trim().length<2}><Send size={16}/>{busy?'Đang tra cứu…':'Gửi'}</button></form>
    {data&&<div className="tutor-footer"><span className="form-help">Nguồn được lưu cùng từng câu hỏi để bạn đối chiếu.</span><button className="text-btn" disabled={busy} onClick={()=>setDeleting(true)}><Trash2 size={14}/> Xóa cuộc trò chuyện</button></div>}
   </div></div>{deleting&&data&&<Dialog title="Xóa cuộc trò chuyện này?" onClose={()=>setDeleting(false)}><p>Câu hỏi và các trích đoạn trong cuộc trò chuyện này sẽ bị xóa.</p><div className="modal-actions"><button className="btn secondary" onClick={()=>setDeleting(false)}>Giữ lại</button><button className="btn danger" disabled={busy} onClick={()=>run(async()=>{await api('tutor-delete',{thread_id:data.thread.id,version:data.thread.version});setDeleting(false);setData(null);await load();})}>Xóa cuộc trò chuyện</button></div></Dialog>}</section>;
}
