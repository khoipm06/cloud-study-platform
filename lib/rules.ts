export type Question={id:string;prompt:string;options:string[];correct:number;explanation:string;lesson_id?:string|null};
export function grade(questions:Question[],answers:Record<string,number>){return Math.round(questions.filter(q=>answers[q.id]===q.correct).length/questions.length*10000)/100;}
export function redact(questions:Question[]){return questions.map(({correct,explanation,...q})=>q);}
export function validQuiz(q:any):q is Question[]{
 return Array.isArray(q)&&q.length>0&&q.length<=50&&q.every(x=>x&&typeof x==='object'&&!Array.isArray(x))&&new Set(q.map(x=>x.id)).size===q.length&&q.every(x=>typeof x.id==='string'&&x.id.length>0&&x.id.length<100&&typeof x.prompt==='string'&&x.prompt.trim().length>0&&x.prompt.length<=1000&&Array.isArray(x.options)&&x.options.length>=2&&x.options.length<=6&&x.options.every((v:any)=>typeof v==='string'&&v.trim()&&v.length<=500)&&Number.isInteger(x.correct)&&x.correct>=0&&x.correct<x.options.length&&typeof x.explanation==='string'&&x.explanation.length<=2000&&(x.lesson_id===undefined||x.lesson_id===null||typeof x.lesson_id==='string'&&x.lesson_id.length<=150));
}
export function validAnswers(q:Question[],a:any){return a&&typeof a==='object'&&!Array.isArray(a)&&Object.entries(a).every(([id,n])=>q.some(x=>x.id===id&&Number.isInteger(n)&&Number(n)>=0&&Number(n)<x.options.length));}
export function fileKind(b:Uint8Array){if(b[0]===0x25&&b[1]===0x50&&b[2]===0x44&&b[3]===0x46&&b[4]===0x2d)return 'application/pdf';if([137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v))return 'image/png';if(b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';return null;}

export function videoSource(raw:unknown){
 if(typeof raw!=='string'||raw.length>2048)return null;
 try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password)return null;
 const host=u.hostname.toLowerCase();let id:string|null=null;
 if(host==='youtu.be')id=u.pathname.slice(1);
 if(['www.youtube.com','youtube.com','m.youtube.com'].includes(host))id=u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.match(/^\/(?:embed|shorts)\/([^/]+)$/)?.[1]||null;
 if(id&&/^[a-zA-Z0-9_-]{11}$/.test(id))return {url:u.href,embed:'https://www.youtube-nocookie.com/embed/'+id};
 if((host==='vimeo.com'||host==='www.vimeo.com')&&/^\/\d+$/.test(u.pathname))return {url:u.href,embed:'https://player.vimeo.com/video'+u.pathname};
 return {url:u.href,embed:null};
 }catch{return null;}
}
export function csvCell(value:unknown){let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
