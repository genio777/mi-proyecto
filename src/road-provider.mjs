import {PlanningError} from './planner.mjs';
// The public service permits one request per second. This queue is shared by
// provider instances, including cancelled calculations waiting for their turn.
let requestQueue=Promise.resolve(),lastRequestAt=0;
const pointKey=p=>p.map(x=>x.toFixed(6)).join(',');
const edgeKey=(a,b)=>pointKey(a)+'>'+pointKey(b);
const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180;
const failure=message=>new PlanningError(message,'ROUTING_SERVICE');
const cancelled=signal=>signal?.reason||new DOMException('Cálculo cancelado.','AbortError');
function check(signal){if(signal?.aborted)throw cancelled(signal);}
function raceAbort(promise,signal){
 if(!signal)return promise;
 check(signal);
 return new Promise((resolve,reject)=>{
  const abort=()=>{cleanup();reject(cancelled(signal));},cleanup=()=>signal.removeEventListener('abort',abort);
  signal.addEventListener('abort',abort,{once:true});
  promise.then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
 });
}
function combinedControl(signals,deadline){
 const controller=new AbortController(),listeners=[];let timer;
 for(const signal of signals.filter(Boolean)){
  if(signal.aborted){controller.abort(cancelled(signal));break;}
  const abort=()=>controller.abort(cancelled(signal));signal.addEventListener('abort',abort,{once:true});listeners.push([signal,abort]);
 }
 if(deadline!==undefined){
  if(!Number.isFinite(deadline))throw failure('Plazo de cálculo no válido.');
  const abort=()=>controller.abort(new PlanningError('Cálculo incompleto: se agotó el tiempo de espera.','ROUTING_SERVICE'));
  if(deadline<=Date.now())abort();else timer=setTimeout(abort,Math.min(2147483647,deadline-Date.now()));
 }
 return {signal:controller.signal,cleanup:()=>{if(timer)clearTimeout(timer);for(const [signal,abort]of listeners)signal.removeEventListener('abort',abort);}};
}
export function createRoadProvider({fetchImpl=globalThis.fetch,baseUrl='https://router.project-osrm.org',timeoutMs=30000,minIntervalMs=1000,snapRadiusMetres=1000,maxAcceptedSnapMetres=250,maxRequests=20,signal:defaultSignal,deadline:defaultDeadline}={}) {
 const routeCache=new Map(),pathCache=new Map(),metricCache=new Map(),invalidPoints=new Set();
 const stats={requests:0,cacheHits:0,isolatedPoints:0};
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0||!Number.isFinite(minIntervalMs)||minIntervalMs<0||!(maxRequests===Infinity||Number.isSafeInteger(maxRequests)&&maxRequests>=0))throw failure('Configuración del servicio de rutas no válida.');
 async function operation(options,run){
  const control=combinedControl([defaultSignal,options?.signal],options?.deadline??defaultDeadline);
  try{check(control.signal);const result=await raceAbort(Promise.resolve().then(()=>run(control.signal)),control.signal);check(control.signal);return result;}
  finally{control.cleanup();}
 }
 async function performRequest(urlPath,signal){
  check(signal);
  if(stats.requests>=maxRequests)throw new PlanningError('Cálculo incompleto: se alcanzó el presupuesto de consultas por carretera. Reduce el itinerario o vuelve a intentarlo.','ROUTING_BUDGET');
  const control=combinedControl([signal],Date.now()+timeoutMs);
  let response;
  try{
   response=await raceAbort(Promise.resolve().then(()=>{
    check(control.signal);
    stats.requests++;
    return fetchImpl(baseUrl+urlPath,{signal:control.signal,headers:{Accept:'application/json',...(typeof window==='undefined'?{'User-Agent':'CargaGratisEspanaJpaz/1.0 (https://github.com/genio777/mi-proyecto)'}:{})}});
   }),control.signal);
   check(signal);
   if(response.status===429)throw failure('El servicio de rutas ha limitado las consultas. Espera antes de volver a calcular.');
   let data;
   try{data=await raceAbort(Promise.resolve().then(()=>response.json()),control.signal);}
   catch(error){check(signal);if(control.signal.aborted)throw cancelled(control.signal);throw failure(response.ok?'El servicio de rutas devolvió una respuesta ilegible.':'Servicio de rutas no disponible (HTTP '+response.status+').');}
   if((response.ok||response.status===400)&&['NoRoute','NoTable','NoSegment'].includes(data?.code))return data;
   if(!response.ok)throw failure('Servicio de rutas no disponible (HTTP '+response.status+').');
   if(data?.code!=='Ok')throw failure('El servicio de rutas rechazó la consulta ('+String(data?.code||'sin código')+').');
   return data;
  }catch(error){
   check(signal);
   if(error instanceof PlanningError)throw error;
   if(control.signal.aborted||error?.name==='TimeoutError'||error?.name==='AbortError')throw failure('El servicio de rutas agotó el tiempo de espera. Vuelve a intentarlo o divide el itinerario.');
   throw failure('No se pudo conectar con el servicio de rutas.');
  }finally{control.cleanup();}
 }
 async function request(urlPath,signal){
  const pending=requestQueue.then(async()=>{
   check(signal);
   const delay=Math.max(0,lastRequestAt+minIntervalMs-Date.now());
   if(delay)await raceAbort(new Promise(resolve=>setTimeout(resolve,delay)),signal);
   check(signal);lastRequestAt=Date.now();return performRequest(urlPath,signal);
  });
  requestQueue=pending.catch(()=>{});
  return raceAbort(pending,signal);
 }
 const validatePoints=points=>{if(!Array.isArray(points)||!points.every(validPoint))throw failure('Coordenadas de carretera no válidas.');};
 const snappedAway=waypoint=>waypoint&&(!Number.isFinite(waypoint.distance)||waypoint.distance<0||waypoint.distance>maxAcceptedSnapMetres);
 const validateMetric=(distance,duration)=>{
  if(distance===null&&duration===null)return null;
  if(!Number.isFinite(distance)||!Number.isFinite(duration)||distance<0||duration<0)throw failure('La matriz de carreteras contiene valores inválidos.');
  return {km:distance/1000,minutes:duration/60};
 };
 const geometry=result=>{
  if(!Array.isArray(result?.geometry?.coordinates)||!result.geometry.coordinates.length||result.geometry.coordinates.some(p=>!Array.isArray(p)||!validPoint([p[1],p[0]])))throw failure('Respuesta de carretera incompleta.');
  return result.geometry.coordinates.map(p=>[p[1],p[0]]);
 };
 function tableRequest(sources,targets){
  const points=[],indices=new Map();
  const index=p=>{const key=pointKey(p);if(!indices.has(key)){indices.set(key,points.length);points.push(p);}return indices.get(key);};
  const sourceIndices=[],targetIndices=[];
  const axis=(list,point)=>{const id=index(point);let position=list.indexOf(id);if(position<0){position=list.length;list.push(id);}return position;};
  const sourceRows=sources.map(p=>axis(sourceIndices,p)),targetRows=targets.map(p=>axis(targetIndices,p));
  return {points,sourceIndices,targetIndices,sourceRows,targetRows,path:'/table/v1/driving/'+points.map(p=>p[1]+','+p[0]).join(';')+'?sources='+sourceIndices.join(';')+'&destinations='+targetIndices.join(';')+'&annotations=distance,duration&radiuses='+points.map(()=>snapRadiusMetres).join(';')};
 }
 async function tableBlock(sources,targets,signal,pendingMetrics,pendingInvalid,retry=true){
  const output=sources.map(()=>targets.map(()=>null));
  const goodSources=sources.map((point,i)=>({point,i})).filter(x=>!invalidPoints.has(pointKey(x.point))&&!pendingInvalid.has(pointKey(x.point)));
  const goodTargets=targets.map((point,i)=>({point,i})).filter(x=>!invalidPoints.has(pointKey(x.point))&&!pendingInvalid.has(pointKey(x.point)));
  if(!goodSources.length||!goodTargets.length)return output;
  const query=tableRequest(goodSources.map(x=>x.point),goodTargets.map(x=>x.point));
  if(query.points.length>50)throw failure('El bloque de carretera supera el límite de coordenadas.');
  // A colocated pair requires no driving and no invented positive distance.
  if(query.points.length===1){for(const a of goodSources)for(const b of goodTargets)output[a.i][b.i]={km:0,minutes:0};return output;}
  const data=await request(query.path,signal);check(signal);
  if(data.code==='NoSegment'){
   const match=typeof data.message==='string'&&data.message.match(/^Could not find a matching segment for coordinate (\d+)\b/);
   const index=match?Number(match[1]):-1;
   if(!retry||!Number.isSafeInteger(index)||index<0||index>=query.points.length)throw failure('No se pudo localizar una coordenada en la carretera. La matriz no se ha completado; revisa las paradas.');
   pendingInvalid.add(pointKey(query.points[index]));
   return tableBlock(sources,targets,signal,pendingMetrics,pendingInvalid,false);
  }
  if(data.code==='NoTable')return output;
  if(data.code!=='Ok')throw failure('El servicio no confirmó la matriz de carreteras.');
  if(data.fallback_speed_cells?.length)throw failure('El servicio devolvió estimaciones sin carretera; no permiten comprobar la autonomía.');
  const validGrid=grid=>Array.isArray(grid)&&grid.length===query.sourceIndices.length&&grid.every(row=>Array.isArray(row)&&row.length===query.targetIndices.length);
  if(!validGrid(data.distances)||!validGrid(data.durations))throw failure('La matriz de carreteras está incompleta.');
  if(data.sources!==undefined&&(!Array.isArray(data.sources)||data.sources.length!==query.sourceIndices.length)||data.destinations!==undefined&&(!Array.isArray(data.destinations)||data.destinations.length!==query.targetIndices.length))throw failure('Los puntos de la matriz de carreteras están incompletos.');
  for(let a=0;a<goodSources.length;a++)for(let b=0;b<goodTargets.length;b++){
   const row=query.sourceRows[a],column=query.targetRows[b];
   const metric=validateMetric(data.distances[row][column],data.durations[row][column]);
   output[goodSources[a].i][goodTargets[b].i]=snappedAway(data.sources?.[row])||snappedAway(data.destinations?.[column])?null:metric;
  }
  return output;
 }
 async function matrix(sources,targets,options={}){
  return operation(options,async signal=>{
   validatePoints(sources);validatePoints(targets);
   const output=sources.map(()=>targets.map(()=>null));
   if(!sources.length||!targets.length)return output;
   let missing=false;
   for(let a=0;a<sources.length;a++)for(let b=0;b<targets.length;b++){
    const key=edgeKey(sources[a],targets[b]);
    if(metricCache.has(key)){output[a][b]=metricCache.get(key);stats.cacheHits++;}
    else if(invalidPoints.has(pointKey(sources[a]))||invalidPoints.has(pointKey(targets[b])))output[a][b]=null;
    else missing=true;
   }
   if(!missing)return output;
   const unique=new Set([...sources,...targets].map(pointKey)),pendingMetrics=new Map(),pendingInvalid=new Set();
   const sourceSize=unique.size<=50?sources.length:Math.min(25,sources.length),targetSize=unique.size<=50?targets.length:Math.min(25,targets.length);
   for(let a=0;a<sources.length;a+=sourceSize)for(let b=0;b<targets.length;b+=targetSize){
    const from=sources.slice(a,a+sourceSize),to=targets.slice(b,b+targetSize);
    if(from.every(p=>to.every(q=>metricCache.has(edgeKey(p,q))||invalidPoints.has(pointKey(p))||invalidPoints.has(pointKey(q)))))continue;
    const result=await tableBlock(from,to,signal,pendingMetrics,pendingInvalid);
    for(let x=0;x<from.length;x++)for(let y=0;y<to.length;y++)pendingMetrics.set(edgeKey(from[x],to[y]),result[x][y]);
   }
   check(signal);
   // A failed or cancelled block never publishes part of this transaction to
   // another consumer. Directed pairs and proven inaccessible points stay separate.
   for(const [key,value]of pendingMetrics)metricCache.set(key,value);
   for(const key of pendingInvalid)if(!invalidPoints.has(key)){invalidPoints.add(key);stats.isolatedPoints++;}
   for(let a=0;a<sources.length;a++)for(let b=0;b<targets.length;b++)output[a][b]=invalidPoints.has(pointKey(sources[a]))||invalidPoints.has(pointKey(targets[b]))?null:metricCache.get(edgeKey(sources[a],targets[b]));
   return output;
  });
 }
 async function route(from,to,full=true,options={}){
  return operation(options,async signal=>{
   validatePoints([from,to]);const key=edgeKey(from,to)+'|'+full;
   if(routeCache.has(key)){stats.cacheHits++;return routeCache.get(key);}
   if(!full&&metricCache.has(edgeKey(from,to))){stats.cacheHits++;return metricCache.get(edgeKey(from,to));}
   if(invalidPoints.has(pointKey(from))||invalidPoints.has(pointKey(to)))return null;
   if(pointKey(from)===pointKey(to))return {km:0,minutes:0,coordinates:full?[from,to]:undefined};
   const data=await request('/route/v1/driving/'+[from,to].map(p=>p[1]+','+p[0]).join(';')+'?overview='+(full?'full':'false')+(full?'&geometries=geojson':'')+'&radiuses='+snapRadiusMetres+';'+snapRadiusMetres,signal);check(signal);
   if(['NoRoute','NoSegment'].includes(data.code)){routeCache.set(key,null);return null;}
   if(data.code!=='Ok')throw failure('El servicio no confirmó la ruta por carretera.');
   if(data.waypoints!==undefined&&(!Array.isArray(data.waypoints)||data.waypoints.length!==2))throw failure('Respuesta de carretera incompleta.');
   if(data.waypoints?.some(snappedAway)){routeCache.set(key,null);return null;}
   const result=data.routes?.[0],metric=validateMetric(result?.distance,result?.duration);
   if(!metric)throw failure('Respuesta de carretera incompleta.');
   const value={...metric,coordinates:full?geometry(result):undefined};check(signal);
   routeCache.set(key,value);metricCache.set(edgeKey(from,to),metric);return value;
  });
 }
 async function path(points,options={}){
  return operation(options,async signal=>{
   validatePoints(points);if(points.length<2)throw failure('Introduce al menos dos puntos para comprobar el itinerario.');
   const key=points.map(pointKey).join('>');if(pathCache.has(key)){stats.cacheHits++;return pathCache.get(key);}
   const legs=[],coordinates=[],pendingMetrics=new Map();let km=0,minutes=0;
   for(let start=0;start<points.length-1;start+=49){
    const part=points.slice(start,start+50);
    if(part.every(p=>pointKey(p)===pointKey(part[0]))){for(let i=1;i<part.length;i++)legs.push({km:0,minutes:0});coordinates.push(...(coordinates.length?part.slice(1):part));continue;}
    const data=await request('/route/v1/driving/'+part.map(p=>p[1]+','+p[0]).join(';')+'?overview=full&geometries=geojson&steps=false&continue_straight=false&radiuses='+part.map(()=>snapRadiusMetres).join(';'),signal);check(signal);
    if(data.code==='NoRoute')return null;
    if(data.code==='NoSegment')throw failure('No se pudo localizar una parada en la carretera; el itinerario no está completo.');
    if(data.code!=='Ok')throw failure('El servicio no confirmó el itinerario por carretera.');
    if(data.waypoints!==undefined&&(!Array.isArray(data.waypoints)||data.waypoints.length!==part.length))throw failure('Los puntos del itinerario están incompletos.');
    if(data.waypoints?.some(snappedAway))return null;
    const result=data.routes?.[0],metric=validateMetric(result?.distance,result?.duration);
    if(!metric||!Array.isArray(result.legs)||result.legs.length!==part.length-1)throw failure('Los tramos del itinerario están incompletos.');
    const partLegs=result.legs.map(leg=>{const value=validateMetric(leg.distance,leg.duration);if(!value)throw failure('El itinerario contiene tramos sin carretera.');return value;});
    const sumKm=partLegs.reduce((sum,leg)=>sum+leg.km,0),sumMinutes=partLegs.reduce((sum,leg)=>sum+leg.minutes,0);
    if(Math.abs(sumKm-metric.km)>Math.max(.01,metric.km*.0001)||Math.abs(sumMinutes-metric.minutes)>Math.max(.01,metric.minutes*.0001))throw failure('Los tramos no coinciden con el total del itinerario.');
    const shape=geometry(result);coordinates.push(...(coordinates.length?shape.slice(1):shape));legs.push(...partLegs);km+=sumKm;minutes+=sumMinutes;
    for(let i=0;i<partLegs.length;i++)pendingMetrics.set(edgeKey(part[i],part[i+1]),partLegs[i]);
   }
   check(signal);const result={km,minutes,coordinates,legs};pathCache.set(key,result);for(const [key,value]of pendingMetrics)metricCache.set(key,value);return result;
  });
 }
 return {route,matrix,metrics:async(from,targets,options={})=>(await matrix([from],targets,options))[0],path,itinerary:path,getStats:()=>({...stats})};
}
