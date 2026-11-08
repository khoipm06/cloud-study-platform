'use client';
import {useRef,useState} from 'react';
import {Download,Upload} from 'lucide-react';

export function PortableBackupControls({backups,canImport,onChanged}:{backups:any[];canImport:boolean;onChanged:()=>Promise<any>}){
 const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');const lock=useRef(false),input=useRef<HTMLInputElement>(null);
 return <div className="portable-backup"><h3>Sao lưu đầy đủ để lưu riêng</h3><p className="form-help">Gói .mohoc chứa dữ liệu và học liệu đã mã hóa, tối đa 128 MiB. Lưu gói ở nơi riêng và giữ khóa mã hóa trong kho bí mật của bạn. Nhập gói chỉ thêm bản sao lưu; cần xem trước và xác nhận riêng để khôi phục.</p>
  <div className="portable-downloads">{backups.filter(b=>b.status==='READY').slice(0,5).map(b=><a className="btn secondary" key={b.id} href={'/api/backup-export/'+encodeURIComponent(b.id)} download><Download size={15}/> Gói {new Date(b.created_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</a>)}</div>
  {canImport&&<form onSubmit={async e=>{e.preventDefault();if(!file||lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');try{if(file.size>128*1024*1024)throw new Error('Gói sao lưu tối đa 128 MiB.');const r=await fetch('/api/backup-import',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Mo-Hoc':'1'},body:file});const data:any=await r.json();if(!r.ok)throw new Error(data.error||'Không nhập được bản sao lưu.');setMessage(data.message);setFile(null);if(input.current)input.current.value='';await onChanged();}catch(ex:any){setError(ex.message);}finally{setBusy(false);lock.current=false;}}}><label>Nhập gói sao lưu đã giữ riêng<input ref={input} type="file" accept=".mohoc,application/octet-stream" disabled={busy} onChange={e=>setFile(e.target.files?.[0]||null)}/></label><button className="btn secondary" disabled={busy||!file}><Upload size={15}/>{busy?'Đang kiểm tra và nhập…':'Kiểm tra & nhập gói'}</button></form>}
  {error&&<p className="alert" role="alert">{error}</p>}{message&&<p className="learning-notice" role="status">{message}</p>}
 </div>;
}
