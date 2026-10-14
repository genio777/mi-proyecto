import React,{useEffect,useState} from 'react';
type Item={id:string;name:string;address:string;instructions:string;lat:number;lng:number;power_kw:number;connector:string;created_at:string};
type Vote={charger_id:string;verdict:string;user_id:string;comment:string};
const base=(import.meta.env.VITE_SUPABASE_URL||'').replace(/\/$/,'');
const key=import.meta.env.VITE_SUPABASE_ANON_KEY||'';
const ready=Boolean(base&&key);
const tokenKey='cg_community_token';
async function request(path:string,method='GET',body?:unknown,auth?:string){
 const res=await fetch(base+path,{method,headers:{apikey:key,'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{Authorization:'Bearer '+key}),...(method==='POST'?{Prefer:'return=representation'}:{})},body:body?JSON.stringify(body):undefined});
 if(!res.ok)throw new Error('Servicio comunitario: '+res.status+' '+(await res.text()).slice(0,180));
 return res.status===204?null:res.json();
}
async function identity(){
 const saved=localStorage.getItem(tokenKey);
 if(saved){try{const x=JSON.parse(saved);if(x.expires_at>Date.now()+60000)return x.access_token}catch{}}
 const x=await request('/auth/v1/signup','POST',{});if(!x.access_token)throw Error('Activa Anonymous Sign-Ins en Supabase Auth');
 localStorage.setItem(tokenKey,JSON.stringify({access_token:x.access_token,expires_at:Date.now()+Number(x.expires_in||3600)*1000}));return x.access_token as string;
}
export default function Community({proposal}:{proposal?:{name:string;address:string;instructions:string;lat:number;lng:number;power_kw:number;connector:string}|null}){
 const[items,setItems]=useState<Item[]>([]),[votes,setVotes]=useState<Vote[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const reload=async()=>{if(!ready)return;try{const [a,b]=await Promise.all([request('/rest/v1/community_chargers?select=*&order=created_at.desc&limit=200'),request('/rest/v1/community_votes?select=charger_id,verdict,user_id,comment')]);setItems(a||[]);setVotes(b||[])}catch(e){setMessage(String(e))}};
 useEffect(()=>{void reload()},[]);
 const publish=async()=>{if(!proposal)return;setBusy(true);try{const auth=await identity();await request('/rest/v1/community_chargers','POST',{...proposal,owner_id:parseJwt(auth).sub},auth);setMessage('Punto enviado a la comunidad. Pendiente de confirmaciones.');await reload()}catch(e){setMessage(String(e))}finally{setBusy(false)}};
 const vote=async(id:string,verdict:'confirmed'|'incorrect')=>{setBusy(true);try{const auth=await identity();const user=parseJwt(auth).sub;await request('/rest/v1/community_votes?on_conflict=charger_id,user_id','POST',{charger_id:id,user_id:user,verdict,updated_at:new Date().toISOString()},auth);setMessage('Voto registrado');await reload()}catch(e){setMessage(String(e))}finally{setBusy(false)}};
 return <section><h2>Comunidad: cargadores gratuitos</h2>{!ready?<p className="notice">La publicación compartida requiere configurar Supabase. No se enviará ningún dato hasta activar el servicio.</p>:<><p className="muted">Las aportaciones son declaraciones de usuarios, no datos oficiales. Cada cuenta puede emitir un voto por cargador. No se incorporan automáticamente al planificador.</p>{proposal&&<button className="primary" disabled={busy} onClick={publish}>Publicar esta aportación para todos</button>}{items.map(c=>{const yes=votes.filter(v=>v.charger_id===c.id&&v.verdict==='confirmed').length,no=votes.filter(v=>v.charger_id===c.id&&v.verdict==='incorrect').length;return <article key={c.id}><h3>{c.name}</h3><p>{c.address} · {c.power_kw} kW · {c.connector}</p><p>{c.instructions}</p><p><b>{yes} confirmaciones · {no} avisos de error</b> · {yes>=3&&no===0?'Confirmado por la comunidad':'Sin confirmar'}</p><button disabled={busy} onClick={()=>vote(c.id,'confirmed')}>Confirmar que funciona</button><button disabled={busy} onClick={()=>vote(c.id,'incorrect')}>Informar de error</button><a target="_blank" rel="noopener noreferrer" href={'https://www.google.com/maps/search/?api=1&query='+c.lat+','+c.lng}>Ver ubicación</a></article>})}</>}{message&&<p className="notice">{message}</p>}</section>;
}
function parseJwt(jwt:string):{sub:string}{const p=jwt.split('.')[1];const x=JSON.parse(atob(p.replace(/-/g,'+').replace(/_/g,'/')));if(typeof x.sub!=='string')throw Error('Identidad no válida');return x}
