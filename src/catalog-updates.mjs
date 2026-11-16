// Published inventory only. REVE authentication remains exclusively in Actions.
export const PUBLISHED_CATALOG_BASE='https://genio777.github.io/mi-proyecto/';
export const CATALOG_CACHE_MAX_AGE_MS=60*60*1000;
export const CATALOG_CACHE_NAME='cg-catalog-v1';
const storageAdapters=new WeakMap(),pendingCacheWrites=new WeakMap();
const allowed=/^data\/(?:chargers-spain\.json|operator-tariffs\.json|international\/(?:index|[A-Z]{2})\.json)$/;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const price=value=>value===null||(typeof value==='number'&&Number.isFinite(value)&&value>=0);
const abortReason=signal=>signal.reason??new DOMException('Carga de catálogo cancelada','AbortError');
const checkAbort=signal=>{if(signal?.aborted)throw abortReason(signal);};
function requirePath(path){if(typeof path!=='string'||!allowed.test(path))throw Error('Archivo de catálogo no admitido.');return path;}
function validUrl(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password;}catch{return false;}}
function invalid(){throw Error('La publicación no contiene un catálogo válido.');}
function stations(list,{country,allowEmpty=false}={}){
 if(!Array.isArray(list)||(!allowEmpty&&!list.length))invalid();
 const ids=new Set();
 for(const station of list){
  if(!object(station)||typeof station.id!=='string'||!station.id||ids.has(station.id)||typeof station.name!=='string'||typeof station.city!=='string'||
   !Number.isFinite(station.lat)||Math.abs(station.lat)>90||!Number.isFinite(station.lng)||Math.abs(station.lng)>180||
   !Number.isFinite(station.power)||station.power<=0||typeof station.connector!=='string'||!station.connector||!price(station.price))invalid();
  ids.add(station.id);
  if(station.connectors!==undefined&&(!Array.isArray(station.connectors)||station.connectors.some(socket=>!object(socket)||typeof socket.type!=='string'||!socket.type||!Number.isFinite(socket.powerKw)||socket.powerKw<=0||socket.price!==undefined&&!price(socket.price))))invalid();
  if(country&&(station.country!==country||!validUrl(station.sourceUrl)||!object(station.dataProvider)||!validUrl(station.dataProvider.licenseUrl)))invalid();
 }
}
export function validateCatalogResource(path,data){
 requirePath(path);if(!object(data))invalid();
 for(const key of ['updated','updatedAt'])if(data[key]!==undefined&&(typeof data[key]!=='string'||!Number.isFinite(Date.parse(data[key]))))invalid();
 if(path==='data/chargers-spain.json')stations(data.chargers);
 else if(path==='data/operator-tariffs.json'){
  if(!Array.isArray(data.operators)||data.currency!==undefined&&data.currency!=='EUR'||data.unit!==undefined&&data.unit!=='kWh')invalid();
  const ids=new Set();
  for(const operator of data.operators){
   if(!object(operator)||typeof operator.id!=='string'||!operator.id||ids.has(operator.id)||typeof operator.name!=='string'||!Array.isArray(operator.tiers))invalid();
   ids.add(operator.id);
   if(operator.tiers.some(tier=>!object(tier)||typeof tier.label!=='string'||!price(tier.price)))invalid();
  }
 }else if(path==='data/international/index.json'){
  if(data.schemaVersion!==1||!Array.isArray(data.countries))invalid();const ids=new Set();
  for(const country of data.countries){
   if(!object(country)||!/^[A-Z]{2}$/.test(country.code)||country.file!==country.code+'.json'||ids.has(country.code)||!Number.isSafeInteger(country.count)||country.count<0)invalid();
   ids.add(country.code);
   if(country.count===0&&country.bbox===null)continue;
   const box=country.bbox;
   if(!Array.isArray(box)||box.length!==4||!box.every(Number.isFinite)||box[0]<-180||box[2]>180||box[1]<-90||box[3]>90||box[0]>box[2]||box[1]>box[3])invalid();
   if(country.coverageCells!==undefined&&((country.coverageCellDegrees??data.coverageCellDegrees)!==1||!Array.isArray(country.coverageCells)||!country.coverageCells.length||country.coverageCells.some(cell=>!Array.isArray(cell)||cell.length!==2||!cell.every(Number.isInteger)||cell[0]<Math.floor(box[0])||cell[0]>Math.floor(box[2])||cell[1]<Math.floor(box[1])||cell[1]>Math.floor(box[3]))))invalid();
  }
 }else{
  const country=path.slice(-7,-5);if(data.country!==country)invalid();stations(data.chargers,{country,allowEmpty:true});
 }
 return data;
}

// CacheStorage replacements are atomic. This adapter never fetches its keys.
export function createCatalogCache({storage,origin}={}){
 try{storage??=globalThis.caches;origin??=globalThis.location?.origin||'https://localhost';}catch{return null;}
 if(!storage?.open)return null;
 let adapters=storageAdapters.get(storage);if(!adapters){adapters=new Map();storageAdapters.set(storage,adapters);}
 if(adapters.has(origin))return adapters.get(origin);
 const key=path=>new Request(new URL('/__cg_catalog_cache_v1__/'+requirePath(path),origin).href,{credentials:'omit'});
 const adapter={
  async get(path){const cache=await storage.open(CATALOG_CACHE_NAME),response=await cache.match(key(path));return response?.ok?await response.json():null;},
  async set(path,record){const cache=await storage.open(CATALOG_CACHE_NAME);await cache.put(key(path),new Response(JSON.stringify(record),{headers:{'Content-Type':'application/json'}}));}
 };
 adapters.set(origin,adapter);return adapter;
}

function waitForSignal(promise,signal){
 checkAbort(signal);
 if(!signal)return Promise.resolve(promise);
 return new Promise((resolve,reject)=>{
  const cleanup=()=>signal.removeEventListener('abort',abort);
  const abort=()=>{cleanup();reject(abortReason(signal));};
  signal.addEventListener('abort',abort,{once:true});
  Promise.resolve(promise).then(value=>{cleanup();if(signal.aborted)abort();else resolve(value);},error=>{cleanup();reject(error);});
  if(signal.aborted)abort();
 });
}
function scopeFor(signal,timeoutMs){
 checkAbort(signal);const controller=new AbortController();
 const forward=()=>controller.abort(abortReason(signal));signal?.addEventListener('abort',forward,{once:true});
 if(signal?.aborted)forward();
 const timer=setTimeout(()=>controller.abort(new DOMException('La descarga del catálogo ha agotado el tiempo de espera.','TimeoutError')),timeoutMs);
 return {signal:controller.signal,close(){clearTimeout(timer);signal?.removeEventListener('abort',forward);}};
}
function sourceTime(data){const value=data?.updatedAt??data?.updated;return typeof value==='string'&&Number.isFinite(Date.parse(value))?Date.parse(value):null;}
const result=(data,source,{savedAt=null,checkedAt=null,warning=undefined}={})=>({data,source,savedAt,checkedAt,warning});
const joinWarnings=(...values)=>{const unique=[...new Set(values.filter(Boolean))];return unique.filter(value=>!unique.some(other=>other!==value&&other.includes(value))).join(' ')||undefined;};

/**
 * @param {{native?:boolean,fetchFn?:typeof fetch,cache?:{get:(path:string)=>Promise<any>,set:(path:string,record:any)=>Promise<any>}|null,now?:()=>number,maxAgeMs?:number,timeoutMs?:number,cacheTimeoutMs?:number}} options
 */
export function createCatalogUpdates({native=false,fetchFn=(...args)=>fetch(...args),cache=native?createCatalogCache():null,now=()=>Date.now(),maxAgeMs=CATALOG_CACHE_MAX_AGE_MS,timeoutMs=12000,cacheTimeoutMs=2000}={}){
 if(!Number.isFinite(maxAgeMs)||maxAgeMs<0||!Number.isFinite(timeoutMs)||timeoutMs<=0||!Number.isFinite(cacheTimeoutMs)||cacheTimeoutMs<=0)throw Error('Límites de catálogo no válidos.');
 const commits=new Map();
 let writes=cache?pendingCacheWrites.get(cache):null;
 if(cache&&!writes){writes=new Map();pendingCacheWrites.set(cache,writes);}
 async function validateData(path,data,validate,signal){checkAbort(signal);validateCatalogResource(path,data);if(validate)await waitForSignal(Promise.resolve().then(()=>{checkAbort(signal);return validate(data);}),signal);checkAbort(signal);return data;}
 async function cacheOperation(operation,signal){
  const scope=scopeFor(signal,cacheTimeoutMs);
  try{return await waitForSignal(Promise.resolve().then(()=>{checkAbort(scope.signal);return operation(scope.signal);}),scope.signal);}finally{scope.close();}
 }
 async function cached(path,validate,signal){
  if(!cache)return {record:null,warning:undefined};
  try{
   return await cacheOperation(async activeSignal=>{
    const record=await waitForSignal(cache.get(path),activeSignal);checkAbort(activeSignal);
    if(record===null||record===undefined)return {record:null,warning:undefined};
    if(!object(record)||record.version!==1||record.path!==path||!Number.isFinite(record.savedAt)||record.savedAt<0)throw Error('Copia de catálogo inválida');
    await validateData(path,record.data,validate,activeSignal);return {record,warning:undefined};
   },signal);
  }catch(error){checkAbort(signal);return {record:null,warning:'No se pudo utilizar la copia guardada del catálogo.'};}
 }
 async function download(path,url,validate,signal){
  const scope=scopeFor(signal,timeoutMs);
  try{
   const response=await waitForSignal(Promise.resolve().then(()=>{checkAbort(scope.signal);return fetchFn(url,{signal:scope.signal,cache:'no-cache',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',headers:{Accept:'application/json'}});}),scope.signal);
   if(!response?.ok)throw Error('Catálogo no disponible (HTTP '+(response?.status??'desconocido')+').');
   const data=await waitForSignal(Promise.resolve().then(()=>{checkAbort(scope.signal);return response.json();}),scope.signal);
   await validateData(path,data,validate,scope.signal);checkAbort(signal);return data;
  }finally{scope.close();}
 }
 async function commit(path,data,validate,signal,startedAt){
  if(!cache)return {record:{version:1,path,savedAt:now(),data},warning:'La actualización está disponible, pero no se pudo guardar una copia en este dispositivo.'};
  const previous=commits.get(path)||Promise.resolve();
  const pending=previous.catch(()=>{}).then(async()=>{
   checkAbort(signal);
   const latest=await cached(path,validate,signal),candidateTime=sourceTime(data),latestTime=sourceTime(latest.record?.data);
   if(latest.record&&((candidateTime!==null&&latestTime!==null&&candidateTime<latestTime)||((candidateTime===latestTime||candidateTime===null||latestTime===null)&&latest.record.savedAt>startedAt)))return {record:latest.record,retained:true,warning:'Se conserva una copia guardada más reciente que la publicación recibida.'};
   const record={version:1,path,savedAt:now(),data};
   // CacheStorage.put cannot be cancelled. Keep its real completion as a barrier
   // even if this caller stops waiting. Never let a delayed older write race a
   // newer write; serve the new download without persistence while it is busy.
   if(writes.has(path))return {record,warning:joinWarnings(latest.warning,'Hay una copia anterior guardándose. La actualización está disponible, pero no se pudo guardar una nueva copia en este dispositivo.')};
   const write=Promise.resolve().then(()=>{checkAbort(signal);return cache.set(path,record);});
   writes.set(path,write);write.finally(()=>{if(writes.get(path)===write)writes.delete(path);}).catch(()=>{});
   try{checkAbort(signal);await cacheOperation(()=>write,signal);checkAbort(signal);return {record,warning:latest.warning};}
   catch(error){checkAbort(signal);return {record,warning:joinWarnings(latest.warning,'La actualización está disponible, pero no se pudo guardar una copia en este dispositivo.')};}
  });
  commits.set(path,pending);pending.finally(()=>{if(commits.get(path)===pending)commits.delete(path);}).catch(()=>{});
  return waitForSignal(pending,signal);
 }
 /** @param {string} path @param {{signal?:AbortSignal,validate?:(data:any)=>any,force?:boolean,network?:boolean}} options */
 async function read(path,{signal,validate,force=false,network=true}={}){
  requirePath(path);checkAbort(signal);
  if(!native){const data=await download(path,'./'+path,validate,signal),time=now();return result(data,'published',{savedAt:time,checkedAt:time});}
  const current=await cached(path,validate,signal),record=current.record,age=record?now()-record.savedAt:Infinity;
  if(record&&(!network||!force&&age>=0&&age<maxAgeMs))return result(record.data,'cached',{savedAt:record.savedAt,checkedAt:record.savedAt,warning:current.warning});
  let failureWarning=current.warning,checkedAt=null;
  if(network){
   const startedAt=now();checkedAt=startedAt;
   try{
    const data=await download(path,PUBLISHED_CATALOG_BASE+path,validate,signal),candidateTime=sourceTime(data),cachedTime=sourceTime(record?.data);
    if(record&&candidateTime!==null&&cachedTime!==null&&candidateTime<cachedTime)return result(record.data,'cached',{savedAt:record.savedAt,checkedAt,warning:joinWarnings(failureWarning,'Se conserva una copia guardada más reciente que la publicación recibida.')});
    const saved=await commit(path,data,validate,signal,startedAt);checkAbort(signal);
    return result(saved.record.data,saved.retained?'cached':'published',{savedAt:saved.record.savedAt,checkedAt,warning:joinWarnings(failureWarning,saved.warning)});
   }catch(error){checkAbort(signal);failureWarning=joinWarnings(failureWarning,'No se ha podido obtener una publicación válida. Se utiliza el catálogo disponible sin renovar la fecha de sus datos.');}
  }
  if(record)return result(record.data,'cached',{savedAt:record.savedAt,checkedAt,warning:failureWarning});
  const data=await download(path,'./'+path,validate,signal);return result(data,'embedded',{checkedAt,warning:failureWarning});
 }
 return {read};
}
