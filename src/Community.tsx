import React,{useEffect,useRef,useState} from 'react';
import {communityEntries} from './community-proposal.mjs';
type Proposal={name:string;address:string;instructions:string;lat:number;lng:number;power_kw:number;connector:string};
type Entry={number:number;proposal:Proposal;yes:number;no:number};
const owner='genio777',repo='mi-proyecto',issueUrl='https://github.com/genio777/mi-proyecto/issues';
const api='https://api.github.com/repos/'+owner+'/'+repo+'/issues?state=open&per_page=100';
export default function Community({proposal}:{proposal?:Proposal|null}){
 const[items,setItems]=useState<Entry[]>([]),[message,setMessage]=useState(''),[loading,setLoading]=useState(false);
 const request=useRef<AbortController|null>(null);
 const reload=async()=>{
  request.current?.abort();const controller=new AbortController();request.current=controller;let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;controller.abort()},10000);setLoading(true);setMessage('');
  try{
   const r=await fetch(api,{signal:controller.signal,headers:{Accept:'application/vnd.github+json'}});
   if(!r.ok)throw Error('GitHub '+r.status);
   const entries=communityEntries(await r.json());
   if(request.current===controller&&!controller.signal.aborted)setItems(entries);
  }catch(e){if(request.current===controller&&(!controller.signal.aborted||timedOut))setMessage(timedOut?'Las aportaciones han agotado el tiempo de espera. Puedes volver a intentarlo.':'No se pudieron cargar las aportaciones: '+String(e))}
  finally{clearTimeout(timer);if(request.current===controller){request.current=null;setLoading(false)}}
 };
 useEffect(()=>{void reload();return()=>{request.current?.abort();request.current=null}},[]);
 const publish=()=>{if(!proposal)return;const p=proposal;const title='[Cargador gratuito] '+p.name.slice(0,90);const body=['### Aportación comunitaria','Nombre: '+p.name,'Ubicación: '+p.address,'Potencia: '+p.power_kw+' kW','Conector: '+p.connector,'Instrucciones: '+p.instructions,'Coordenadas: '+p.lat+', '+p.lng,'','<!-- CARGAGRATIS_POINT',JSON.stringify(p),'-->'].join('\n');const u='https://github.com/'+owner+'/'+repo+'/issues/new?title='+encodeURIComponent(title)+'&body='+encodeURIComponent(body);window.open(u,'_blank','noopener,noreferrer')};
 return <section><h2>Cargadores gratuitos de la comunidad</h2><p className="muted">Publicación y confirmaciones mediante GitHub, sin servidor de pago. Para aportar o votar se necesita una cuenta gratuita de GitHub. Las reacciones son opiniones de usuarios, no comprobaciones oficiales.</p>{proposal&&<button className="primary" onClick={publish}>Publicar cargador para toda la comunidad</button>}<button onClick={reload} disabled={loading}>{loading?'Actualizando…':'Actualizar aportaciones'}</button>{items.map(x=>{const p=x.proposal,{yes,no}=x;return <article key={x.number}><h3>{p.name}</h3><p>{p.address} · {p.power_kw} kW · {p.connector}</p><p>{p.instructions}</p><p>{yes} confirmaciones · {no} avisos negativos · {yes>=3&&no===0?'Confirmado por usuarios':'Pendiente de confirmación'}</p><a href={issueUrl+'/'+x.number} target="_blank" rel="noopener noreferrer">Confirmar 👍 / Avisar 👎 / Comentar en GitHub</a> · <a href={'https://www.google.com/maps/search/?api=1&query='+p.lat+','+p.lng} target="_blank" rel="noopener noreferrer">Ver ubicación</a></article>})}{message&&<p className="notice" role="status">{message}</p>}<p className="muted">Las aportaciones no se añaden automáticamente a las rutas. <a href={issueUrl} target="_blank" rel="noopener noreferrer">Ver todas las aportaciones</a></p></section>;
}
