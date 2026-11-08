export function validTimezone(value:unknown):value is string{if(typeof value!=='string'||value.length>80)return false;try{new Intl.DateTimeFormat('en',{timeZone:value}).format();return true;}catch{return false;}}
function dateParts(value:string|Date,timezone:string){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));return Object.fromEntries(parts.map(p=>[p.type,p.value]));}
export function zonedDay(value:string|Date,timezone:string){const p=dateParts(value,timezone);return `${p.year}-${p.month}-${p.day}`;}
export function localDateTime(value:string|Date,timezone:string){const p=dateParts(value,timezone);return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;}
export function localToUTC(value:string,timezone:string):string|null{
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)||!validTimezone(timezone))return null;
 const desired=Date.parse(value+':00Z');if(!Number.isFinite(desired))return null;
 let guess=desired;
 for(let i=0;i<4;i++){const p=dateParts(new Date(guess),timezone);const actual=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);const delta=desired-actual;if(delta===0)return localDateTime(new Date(guess),timezone)===value?new Date(guess).toISOString():null;guess+=delta;}
 return null;
}
export function validDay(value:unknown):value is string{return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
