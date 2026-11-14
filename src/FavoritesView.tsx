import React,{useEffect,useRef,useState} from 'react';
import {internationalCatalog} from './international-catalog.mjs';
import StationEvidence from './StationEvidence';

type Props={ids:string[];allChargers:any[];onRemove:(id:string)=>void;onNavigate:(station:any)=>void;onLoaded:(stations:any[])=>void};
export default function FavoritesView({ids,allChargers,onRemove,onNavigate,onLoaded}:Props){
 const known=new Map(allChargers.map(station=>[station.id,station])),onLoadedRef=useRef(onLoaded);
 onLoadedRef.current=onLoaded;
 const missingCountries=[...new Set(ids.filter(id=>!known.has(id)).map(id=>/^ocm-global-([A-Z]{2})-/.exec(id)?.[1]).filter(Boolean))].sort();
 const requestKey=JSON.stringify(missingCountries);
 const [loading,setLoading]=useState(false),[warnings,setWarnings]=useState<string[]>([]),[retry,setRetry]=useState(0);
 useEffect(()=>{
  const codes=JSON.parse(requestKey);setWarnings([]);
  if(!codes.length){setLoading(false);return;}
  const controller=new AbortController();setLoading(true);
  internationalCatalog.loadCountries(codes,{signal:controller.signal}).then(result=>{
   if(controller.signal.aborted)return;
   setWarnings(result.warnings);if(result.stations.length)onLoadedRef.current(result.stations);
  }).catch(error=>{if(!controller.signal.aborted)setWarnings([error instanceof Error?error.message:'No se pudieron recuperar las fichas de favoritos.']);})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[requestKey,retry]);
 const unavailable=ids.some(id=>!known.has(id));
 return <section><h1>Favoritos</h1><p>{ids.length} cargadores guardados</p>{loading&&<p role="status">Recuperando fichas de favoritos internacionales…</p>}{warnings.length>0&&<p role="status" className="notice">{warnings.join(' ')}</p>}{unavailable&&missingCountries.length>0&&!loading&&<button type="button" onClick={()=>setRetry(value=>value+1)}>Reintentar fichas pendientes</button>}<div className="cards">{ids.map(id=>{
  const station=known.get(id);
  return station?<article key={id}><h3>{station.name}</h3><p>{station.city}{station.country?' · '+station.country:''} · {Number.isFinite(station.power)&&station.power>0?station.power+' kW':'Potencia no indicada'}</p>{station.address&&<p>{station.address}</p>}<StationEvidence station={station}/><button type="button" onClick={()=>onNavigate(station)}>Navegar</button><button type="button" onClick={()=>onRemove(id)}>Quitar favorito</button></article>:<article key={id}><h3>Ficha pendiente</h3><p>Identificador guardado: {id}</p><p>La estación no está disponible en los catálogos cargados. No se presume que siga operativa.</p><button type="button" onClick={()=>onRemove(id)}>Quitar favorito</button></article>;
 })}</div></section>;
}
