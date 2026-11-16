import {useCallback,useEffect,useRef,useState} from 'react';
import {catalogUpdates,nativeCatalogMode} from './catalog-client';
import {CATALOG_CACHE_MAX_AGE_MS} from './catalog-updates.mjs';

export type CatalogReadResult={
 data:any;
 source:'published'|'cached'|'embedded';
 savedAt:number|null;
 checkedAt:number|null;
 warning?:string;
};
export type CatalogResourceState={
 available:boolean;
 source:CatalogReadResult['source']|null;
 savedAt:number|null;
 checkedAt:number|null;
 sourceDate:string|null;
 warning?:string;
 error?:string;
};
type Resource='national'|'tariffs';
type Options={
 onNational:(result:CatalogReadResult)=>void;
 onTariffs:(result:CatalogReadResult)=>void;
 paused:boolean;
 isBusy:()=>boolean;
};
const emptyState=():CatalogResourceState=>({available:false,source:null,savedAt:null,checkedAt:null,sourceDate:null});
const paths:Record<Resource,string>={national:'data/chargers-spain.json',tariffs:'data/operator-tariffs.json'};
const resources:Resource[]=['national','tariffs'];
const UPDATE_BUDGET_MS=20000;

// Keep network and pending-result callbacks independent of App render identity.
// A route always finishes using its original catalogue; an arriving refresh is
// applied only after the caller releases its calculation lock.
export default function useCatalogUpdates(options:Options){
 const callbacks=useRef(options);callbacks.current=options;
 const [national,setNational]=useState<CatalogResourceState>(emptyState);
 const [tariffs,setTariffs]=useState<CatalogResourceState>(emptyState);
 const [refreshing,setRefreshing]=useState(false),[pending,setPending]=useState(false),[message,setMessage]=useState('');
 const mounted=useRef(false),active=useRef<AbortController|null>(null),running=useRef<Promise<void>|null>(null);
 const pendingResults=useRef<Partial<Record<Resource,CatalogReadResult>>>({});
 const lastNetworkAttempt=useRef<number|null>(null),automaticDue=useRef(false);
 const runRef=useRef<(force?:boolean,startup?:boolean)=>Promise<void>>(()=>Promise.resolve());

 const showResult=(resource:Resource,result:CatalogReadResult)=>{
  if(!mounted.current)return;
  if(callbacks.current.isBusy()){
   pendingResults.current[resource]=result;setPending(true);
   setMessage('La consulta ha terminado; los datos se aplicarán al finalizar el cálculo.');
   return;
  }
  const sourceDate=result.data?.updatedAt??result.data?.updated;
  const state:CatalogResourceState={available:true,source:result.source,savedAt:result.savedAt,checkedAt:result.checkedAt,sourceDate:typeof sourceDate==='string'?sourceDate:null,warning:result.warning};
  if(resource==='national'){callbacks.current.onNational(result);setNational(state);}
  else{callbacks.current.onTariffs(result);setTariffs(state);}
 };
 const showError=(resource:Resource,error:unknown)=>{
  if(!mounted.current)return;
  const detail=error instanceof Error&&error.name==='TimeoutError'?'La consulta de estos datos ha agotado su tiempo de espera.':resource==='national'?'No se ha podido obtener un catálogo válido de estaciones.':'No se han podido consultar referencias de tarifas válidas.';
  const update=(previous:CatalogResourceState)=>({...previous,error:detail});
  if(resource==='national')setNational(update);else setTariffs(update);
 };

 runRef.current=(force=false,startup=false)=>{
  if(running.current)return running.current;
  if(!mounted.current)return Promise.resolve();
  if(callbacks.current.isBusy()){
   if(!force)automaticDue.current=true;
   setMessage('Espera a que termine el cálculo para actualizar los catálogos.');
   return Promise.resolve();
  }
  const controller=new AbortController();active.current=controller;setRefreshing(true);setMessage('');
  const deadline=Date.now()+UPDATE_BUDGET_MS;
  const expire=()=>controller.abort(new DOMException('La actualización ha alcanzado su tiempo máximo. Se conservan los datos disponibles.','TimeoutError'));
  const checkDeadline=()=>{if(Date.now()>=deadline&&!controller.signal.aborted)expire();return controller.signal.aborted;};
  const timer=setTimeout(expire,UPDATE_BUDGET_MS);
  const phase=async(network:boolean)=>{
   const attemptedAt=Date.now();if(network)lastNetworkAttempt.current=attemptedAt;
   const results=await Promise.allSettled(resources.map(async resource=>{
    const result=await catalogUpdates.read(paths[resource],{signal:controller.signal,network,force:network&&force}) as CatalogReadResult;
    if(checkDeadline()||active.current!==controller||!mounted.current)return;
    showResult(resource,result);
    return result;
   }));
   for(let index=0;index<results.length;index++){
    const result=results[index];
    if(result.status==='rejected'&&!controller.signal.aborted&&active.current===controller)showError(resources[index],result.reason);
   }
   if(network&&!controller.signal.aborted&&active.current===controller){
    // Reusing a fresh cached record did not contact its publisher. Base the next
    // check on that record's original check time, not this App session's start.
    // Any warning/failure keeps a full-hour backoff from the actual attempt.
    const failed=results.some(item=>item.status==='rejected'||Boolean(item.status==='fulfilled'&&item.value?.warning));
    if(!failed)for(const item of results)if(item.status==='fulfilled'&&item.value?.source==='cached'){
     const checked=item.value.checkedAt;
     if(typeof checked==='number'&&Number.isFinite(checked)&&checked>=0&&checked<=attemptedAt)lastNetworkAttempt.current=Math.min(lastNetworkAttempt.current??attemptedAt,checked);
    }
   }
  };
  const operation=(async()=>{
   try{
    if(startup&&nativeCatalogMode){
     await phase(false);
     if(controller.signal.aborted)return;
    }
    if(callbacks.current.isBusy()){automaticDue.current=true;return;}
    automaticDue.current=false;
    await phase(true);
   }catch(error){
    if(!controller.signal.aborted&&mounted.current&&active.current===controller)setMessage(error instanceof Error?error.message:'No se pudo completar la consulta de catálogos.');
   }finally{
    clearTimeout(timer);
    if(active.current===controller){
     active.current=null;running.current=null;
     if(mounted.current){
      setRefreshing(false);
      if(controller.signal.aborted&&controller.signal.reason?.name==='TimeoutError')setMessage('La actualización ha alcanzado su tiempo máximo. Se conservan los datos disponibles.');
     }
    }
   }
  })();
  running.current=operation;
  return operation;
 };

 const refresh=useCallback(()=>runRef.current(true),[]);
 useEffect(()=>{
  mounted.current=true;
  void runRef.current(false,true);
  const check=()=>{
   if(document.visibilityState==='hidden')return;
   const elapsed=lastNetworkAttempt.current===null?Infinity:Date.now()-lastNetworkAttempt.current;
   if(elapsed<CATALOG_CACHE_MAX_AGE_MS)return;
   void runRef.current(false);
  };
  document.addEventListener('visibilitychange',check);window.addEventListener('focus',check);
  // The lightweight timer does no I/O unless the one-hour condition is due.
  const interval=setInterval(check,60000);
  return()=>{
   mounted.current=false;active.current?.abort();active.current=null;running.current=null;pendingResults.current={};
   clearInterval(interval);document.removeEventListener('visibilitychange',check);window.removeEventListener('focus',check);
  };
 },[]);
 useEffect(()=>{
  if(options.paused||!mounted.current||callbacks.current.isBusy())return;
  const queued=pendingResults.current;pendingResults.current={};
  for(const resource of resources){const result=queued[resource];if(result)showResult(resource,result);}
  if(Object.keys(queued).length){setPending(false);setMessage('');}
  if(automaticDue.current)void runRef.current(false);
 },[options.paused]);

 return {native:nativeCatalogMode,national,tariffs,refreshing,pending,message,refresh};
}
