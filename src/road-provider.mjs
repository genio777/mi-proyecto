import {PlanningError} from './planner.mjs';
let requestQueue=Promise.resolve(),lastRequestAt=0;
const pointKey=p=>p.map(x=>x.toFixed(6)).join(',');
export function createRoadProvider({fetchImpl=globalThis.fetch,baseUrl='https://router.project-osrm.org',timeoutMs=30000,minIntervalMs=1000,snapRadiusMetres=1000,maxAcceptedSnapMetres=250}={}) {
 const cache=new Map();
 async function performRequest(path){
  let response;
  try{response=await fetchImpl(baseUrl+path,{signal:AbortSignal.timeout(timeoutMs),headers:{Accept:'application/json',...(typeof window==='undefined'?{'User-Agent':'CargaGratisEspanaJpaz/1.0 (https://github.com/genio777/mi-proyecto)'}:{})}});}catch(error){throw new PlanningError(error?.name==='TimeoutError'||error?.name==='AbortError'?'El servicio de rutas agotó el tiempo de espera. Vuelve a intentarlo o divide el itinerario.':'No se pudo conectar con el servicio de rutas.','ROUTING_SERVICE');}
  if(response.status===429)throw new PlanningError('El servicio de rutas ha limitado las consultas. Espera antes de volver a calcular.','ROUTING_SERVICE');
  let data;try{data=await response.json();}catch{if(!response.ok)throw new PlanningError('Servicio de rutas no disponible (HTTP '+response.status+').','ROUTING_SERVICE');throw new PlanningError('El servicio de rutas devolvió una respuesta ilegible.','ROUTING_SERVICE');}
  if((response.ok||response.status===400)&&['NoRoute','NoSegment'].includes(data.code))return null;
  if(!response.ok)throw new PlanningError('Servicio de rutas no disponible (HTTP '+response.status+').','ROUTING_SERVICE');
  if(data.code!=='Ok')throw new PlanningError('El servicio de rutas rechazó la consulta ('+String(data.code||'sin código')+').','ROUTING_SERVICE');
  return data;
 }
 async function request(path){
  const pending=requestQueue.then(async()=>{const delay=Math.max(0,lastRequestAt+minIntervalMs-Date.now());if(delay)await new Promise(resolve=>setTimeout(resolve,delay));lastRequestAt=Date.now();return performRequest(path);});
  requestQueue=pending.catch(()=>{});return pending;
 }
 async function route(from,to,geometry=true){
  const key=pointKey(from)+'>'+pointKey(to)+'|'+geometry;
  if(cache.has(key))return cache.get(key);
  const promise=(async()=>{
   if(pointKey(from)===pointKey(to))return {km:0,minutes:0,coordinates:geometry?[from,to]:undefined};
   const data=await request('/route/v1/driving/'+[from,to].map(p=>p[1]+','+p[0]).join(';')+'?overview='+(geometry?'full':'false')+(geometry?'&geometries=geojson':'')+'&radiuses='+snapRadiusMetres+';'+snapRadiusMetres);
   if(!data)return null;
   if(Array.isArray(data.waypoints)&&data.waypoints.some(p=>!Number.isFinite(p.distance)||p.distance>maxAcceptedSnapMetres))return null;
   const result=data.routes?.[0];if(!result||!Number.isFinite(result.distance)||!Number.isFinite(result.duration)||result.distance<0||result.duration<0||(geometry&&!Array.isArray(result.geometry?.coordinates)))throw new PlanningError('Respuesta de carretera incompleta.','ROUTING_SERVICE');
   return {km:result.distance/1000,minutes:result.duration/60,coordinates:geometry?result.geometry.coordinates.map(p=>[p[1],p[0]]):undefined};
  })();cache.set(key,promise);promise.catch(()=>cache.delete(key));return promise;
 }
 async function metrics(from,targets){
  const output=[];
  // Bound URL/coordinate counts; route geometry is requested separately only for the chosen path.
  for(let start=0;start<targets.length;start+=48){
   const slice=targets.slice(start,start+48),points=[from,...slice];
   const data=await request('/table/v1/driving/'+points.map(p=>p[1]+','+p[0]).join(';')+'?sources=0&destinations='+slice.map((_,i)=>i+1).join(';')+'&annotations=distance,duration&radiuses='+points.map(()=>snapRadiusMetres).join(';'));
   if(!data){for(const target of slice)output.push(await route(from,target,false));continue;}
   if(!Array.isArray(data.distances?.[0])||!Array.isArray(data.durations?.[0])||data.distances[0].length!==slice.length||data.durations[0].length!==slice.length)throw new PlanningError('La matriz de carreteras está incompleta.','ROUTING_SERVICE');
   for(let i=0;i<slice.length;i++){
    const km=data.distances[0][i],minutes=data.durations[0][i];
    if((data.sources?.[0]&&(!Number.isFinite(data.sources[0].distance)||data.sources[0].distance>maxAcceptedSnapMetres))||(data.destinations?.[i]&&(!Number.isFinite(data.destinations[i].distance)||data.destinations[i].distance>maxAcceptedSnapMetres))){output.push(null);continue;}
    // null is OSRM's explicit unreachable-pair marker. Zero remains a valid colocated leg.
    if(km===null&&minutes===null){output.push(null);continue;}
    if(!Number.isFinite(km)||!Number.isFinite(minutes)||km<0||minutes<0)throw new PlanningError('La matriz de carreteras contiene valores inválidos.','ROUTING_SERVICE');
    output.push({km:km/1000,minutes:minutes/60});
   }
  }
  return output;
 }
 return {route,metrics};
}
