'use client';
import {useEffect,useRef,useState} from 'react';
import {Bell,BellOff,CalendarDays,RefreshCw,Send,Smartphone} from 'lucide-react';
import {featureApi as api} from './features-client';

function bytes(value:string) { return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)); }
async function deviceId(endpoint:string) {
  const result=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint)));
  return btoa(String.fromCharCode(...result)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function CalendarExport({query}:{query:string}) {
  return <a className="btn secondary" href={'/api/'+query.replace(/^planner\?/,'planner-calendar?')} download="cloud-study.ics"><CalendarDays size={15}/> Xuất lịch tuần (.ics)</a>;
}
export function BrowserReminders({user,enabled}:{user:any;enabled:boolean}) {
  const [data,setData]=useState<any>(null),[current,setCurrent]=useState(''),[supported,setSupported]=useState<boolean|null>(null);
  const [permission,setPermission]=useState('default'),[label,setLabel]=useState('Thiết bị của tôi'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const lock=useRef(false);
  const load=async()=>{
    const next=await api('push-settings');setData(next);
    const registration=await navigator.serviceWorker?.getRegistration('/mo-hoc-sw.js');
    const subscription=await registration?.pushManager?.getSubscription();
    setCurrent(subscription?await deviceId(subscription.endpoint):'');
    if(typeof Notification!=='undefined')setPermission(Notification.permission);
    return next;
  };
  useEffect(()=>{
    let live=true;
    const available=window.isSecureContext&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
    setSupported(available);
    if(available)setPermission(Notification.permission);
    api('push-settings').then(async next=>{
      if(!live)return;setData(next);
      if(available){const registration=await navigator.serviceWorker.getRegistration('/mo-hoc-sw.js');const subscription=await registration?.pushManager.getSubscription();if(live)setCurrent(subscription?await deviceId(subscription.endpoint):'');}
    }).catch(e=>{if(live)setError(e.message);});
    return()=>{live=false;};
  },[user.id]);
  const task=async(fn:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');try{await fn();}catch(e:any){setError(e.message||'Chưa cập nhật được thông báo.');}finally{lock.current=false;setBusy(false);}};
  const ownCurrent=data?.devices.find((d:any)=>d.id===current);
  const enable=()=>{
    if(lock.current)return;
    // Permission is requested from the click gesture, before any asynchronous registration.
    const permissionRequest=Notification.requestPermission();
    task(async()=>{
      const granted=await permissionRequest;setPermission(granted);
      if(granted!=='granted')throw new Error('Chưa được cấp quyền. Bạn có thể bật lại trong cài đặt của trình duyệt.');
      const registration=await navigator.serviceWorker.register('/mo-hoc-sw.js',{scope:'/'});
      let timeout:ReturnType<typeof setTimeout>|undefined;
      try{await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Chưa khởi tạo được thông báo. Hãy tải lại trang và thử lại.')),15000);})]);}
      finally{clearTimeout(timeout);}
      let subscription=await registration.pushManager.getSubscription();
      const publicKey=bytes(data.public_key);
      const keyMatches=subscription?.options.applicationServerKey&&
        new Uint8Array(subscription.options.applicationServerKey).every((v,i)=>v===publicKey[i])&&subscription.options.applicationServerKey.byteLength===publicKey.length;
      if(subscription&&(!ownCurrent||!keyMatches)){await subscription.unsubscribe();subscription=null;}
      let created=false;
      if(!subscription){subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicKey});created=true;}
      try{await api('push-subscribe',{...subscription.toJSON(),label});}
      catch(e){if(created)await subscription.unsubscribe();throw e;}
      await load();setMessage('Đã bật nhắc học trên thiết bị này. Bạn có thể gửi thông báo thử để kiểm tra.');
    });
  };
  return <section className="panel section browser-reminders"><div className="panel-heading"><div><h2><Bell size={18}/> Nhắc học trên thiết bị</h2><p className="form-help">Nhận thông báo khi đã đóng trang, sau khi bạn cho phép trên từng thiết bị.</p></div><button className="text-btn" disabled={busy} onClick={()=>task(async()=>{await load();})}><RefreshCw size={15}/> Làm mới</button></div><div className="advanced-pad">
    {error&&<div className="alert" role="alert">{error}</div>}{message&&<p className="learning-notice" role="status">{message}</p>}
    {supported===false&&<p className="learning-notice">Trình duyệt này chưa hỗ trợ thông báo đẩy. Bạn vẫn có thể xuất lịch tuần để dùng nhắc hẹn của ứng dụng lịch. Trên iPhone/iPad, hãy thêm Cloud study platform vào Màn hình chính và mở từ đó.</p>}
    {data&&!data.configured&&<p className="learning-notice">Nhắc qua trình duyệt chưa được cấu hình. Thông báo trong ứng dụng và xuất lịch vẫn sử dụng được.</p>}
    {supported&&permission==='denied'&&<p className="learning-notice">Thông báo đang bị trình duyệt chặn. Mở cài đặt quyền của website nếu bạn muốn bật lại.</p>}
    {!enabled&&<p className="learning-notice">Bạn đang tắt nhắc học. Bật “Nhắc tôi trước phiên học” trong cài đặt để nhận nhắc theo lịch, kể cả trên các thiết bị đã đăng ký.</p>}
    {supported&&data?.configured&&!ownCurrent&&<div className="push-enroll"><label>Tên thiết bị<input value={label} onChange={e=>setLabel(e.target.value)} maxLength={80} placeholder="Ví dụ: Laptop học tập"/></label><button className="btn primary" disabled={busy||permission==='denied'||!label.trim()||!enabled} onClick={enable}><Bell size={15}/> Bật trên thiết bị này</button></div>}
    {data?.devices.map((device:any)=><div className="advanced-row" key={device.id}><Smartphone size={18}/><div className="advanced-main"><h3>{device.label}{device.id===current?' · Thiết bị này':''}</h3><p>{device.last_success_at?'Dịch vụ nhận gần nhất: '+new Date(device.last_success_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chưa ghi nhận yêu cầu được dịch vụ chấp nhận'}{device.last_status>=400?' · Lần gửi gần nhất gặp lỗi':''}</p></div><div className="button-row">{device.id===current&&<button className="text-btn" disabled={busy||permission!=='granted'} onClick={()=>task(async()=>{const result=await api('push-test',{id:device.id});setMessage(result.message);await load();})}><Send size={14}/> Gửi thử</button>}<button className="text-btn" disabled={busy} aria-label={'Tắt nhắc trên '+device.label} onClick={()=>task(async()=>{await api('push-unsubscribe',{id:device.id});if(device.id===current){const registration=await navigator.serviceWorker.getRegistration('/mo-hoc-sw.js');await(await registration?.pushManager.getSubscription())?.unsubscribe();}await load();setMessage('Đã tắt nhắc trên thiết bị.');})}><BellOff size={14}/> Tắt</button></div></div>)}
    <p className="form-help">Lịch máy chủ kiểm tra mỗi giờ nên có thể nhắc trễ gần một giờ. Thông báo chỉ hiện nội dung chung. Hệ điều hành có thể trì hoãn khi tiết kiệm pin hoặc tắt thông báo. Đăng xuất không tự tắt đăng ký nhắc; hãy tắt thiết bị ở đây nếu dùng máy chung.</p>
    <p className="form-help">File .ics là bản chụp lịch tại lúc tải. Sau khi đổi hoặc hủy phiên học, cần cập nhật lại trong ứng dụng lịch của bạn; Cloud study platform không tự đồng bộ lịch bên ngoài.</p>
  </div></section>;
}
