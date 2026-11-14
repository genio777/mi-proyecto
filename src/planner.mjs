// Planner independent of React. Only provider-verified road metrics establish reachability.
// The search minimises estimated time (or known cost) on a corridor graph with 1% SOC steps.
const EPS = 1e-7;
const LIMITATIONS = 'Optimización estimada en un corredor de 35 km con alternativas seleccionadas por tramo y pasos conservadores del 1% de SOC. Curva de carga supuesta, 5 min de conexión por parada; sin tráfico, esperas, clima, fronteras ni consumo auxiliar. No garantiza el óptimo global, la disponibilidad ni el acceso exacto al poste.';
export class PlanningError extends Error { constructor(message, code = 'PLANNING_FAILED') { super(message); this.name = 'PlanningError'; this.code = code; } }
export const haversine = (a,b) => {
 const radians=Math.PI/180,dLat=(b[0]-a[0])*radians,dLng=(b[1]-a[1])*radians;
 const x=Math.sin(dLat/2)**2+Math.cos(a[0]*radians)*Math.cos(b[0]*radians)*Math.sin(dLng/2)**2;
 return 12742*Math.asin(Math.sqrt(Math.min(1,Math.max(0,x))));
};
const normal=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function vehicleSpecification(name, {maxAcKw, maxChargeKw} = {}) {
 const zoe=name==='Renault Zoe R90',tesla=name==='Tesla Model Y Standard Range';
 return {name,connectors:zoe?['Tipo2']:tesla?['CCS','Tipo2']:[],maxAcKw:Math.max(0,Math.min(zoe?22:tesla?11:0,maxAcKw==null?(zoe?22:tesla?11:0):Number(maxAcKw)||0)),maxDcKw:zoe?0:Math.max(0,Math.min(tesla?170:0,maxChargeKw==null?(tesla?170:0):Number(maxChargeKw)||0))};
}
export function compatibleSocket(station, vehicle, connectorFilters=[]) {
 const allowed=new Set(vehicle.connectors.map(normal));
 const selected=new Set(connectorFilters.map(normal));
 let sockets;
 if(Array.isArray(station.connectors))sockets=station.connectors;
 else {
  const types=String(station.connector||'').split(',').map(x=>x.trim()).filter(Boolean);
  // An aggregate maximum cannot identify the power of any socket at a mixed station.
  sockets=types.length===1?[{type:types[0],powerKw:station.power}]:[];
 }
 const matches=sockets.filter(s=>allowed.has(normal(s.type))&&(!selected.size||selected.has(normal(s.type)))&&Number.isFinite(s.powerKw)&&s.powerKw>0).map(s=>{
  const ac=normal(s.type)==='tipo2';
  // Preserve provider power type: never treat a DC Type 2 or AC CCS record as validated.
  if((ac&&normal(s.powerType)==='dc')||(!ac&&normal(s.powerType)==='ac'))return null;
  return {type:s.type,socketPowerKw:s.powerKw,powerKw:Math.min(s.powerKw,ac?vehicle.maxAcKw:vehicle.maxDcKw),ac};
 }).filter(s=>s&&s.powerKw>0);
 return matches.sort((a,b)=>b.powerKw-a.powerKw)[0]||null;
}
export function eligibleForMode(station,vehicle,{mode='cheap',maximumPower=0,connectorFilters=[]}={}) {
 if(station.publicAccess===false)return false;
 const socket=compatibleSocket(station,vehicle,connectorFilters);
 if(!socket)return false;
 if(mode==='fast')return socket.socketPowerKw>=100&&socket.powerKw>=100;
 if(maximumPower>0&&socket.powerKw>maximumPower)return false;
 return mode!=='free'||station.price===0;
}
export function chargingMinutes(socket,fromKwh,toKwh,batteryKwh) {
 if(!socket||!(socket.powerKw>0)||!(batteryKwh>0)||toKwh<fromKwh-EPS)return Infinity;
 let minutes=0;
 const bands=socket.ac?[[95,.9],[100,.7]]:[[50,.8],[70,.65],[80,.5],[90,.35],[100,.2]];
 let from=Math.max(0,fromKwh);
 for(const [percent,factor]of bands){const end=Math.min(toKwh,batteryKwh*percent/100);if(end>from){minutes+=(end-from)/(socket.powerKw*factor)*60;from=end;}if(from>=toKwh-EPS)break;}
 return minutes;
}
function routeSamples(coords) {
 const samples=[];let km=0;
 for(let i=0;i<coords.length;i++){
  if(i){const distance=haversine(coords[i-1],coords[i]);const steps=Math.max(1,Math.ceil(distance/8));for(let j=1;j<steps;j++)samples.push({point:[coords[i-1][0]+(coords[i][0]-coords[i-1][0])*j/steps,coords[i-1][1]+(coords[i][1]-coords[i-1][1])*j/steps],km:km+distance*j/steps});km+=distance;}
  // Keep bends but coalesce the dense, nearly identical points returned by OSRM.
  if(!samples.length||haversine(samples[samples.length-1].point,coords[i])>2||i===coords.length-1)samples.push({point:coords[i],km});
 }
 return samples;
}
function createCorridorSelection(route,{corridorKm=35,perBucket=6,bucketKm=40}={}) {
 const coords=route.coordinates||[];
 const samples=routeSamples(coords),grid=new Map(),cell=.5;
 for(const sample of samples){const key=Math.floor(sample.point[0]/cell)+':'+Math.floor(sample.point[1]/cell);if(!grid.has(key))grid.set(key,[]);grid.get(key).push(sample);}
 const found=[];
 const add=station=>{
  if(!Number.isFinite(station.lat)||!Number.isFinite(station.lng))return;
  const point=[station.lat,station.lng],latCell=Math.floor(station.lat/cell),lngCell=Math.floor(station.lng/cell);
  const dx=Math.min(720,Math.ceil((corridorKm+10)/(111*cell*Math.max(.03,Math.cos(station.lat*Math.PI/180))))),dy=Math.ceil((corridorKm+10)/(111*cell));
  let nearest=Infinity,along=0;
  for(let x=-dx;x<=dx;x++)for(let y=-dy;y<=dy;y++)for(const sample of grid.get((latCell+y)+':'+(lngCell+x))||[]){const d=haversine(point,sample.point);if(d<nearest){nearest=d;along=sample.km;}}
  if(nearest<=corridorKm+4)found.push({station,nearest,along});
 };
 const finish=()=>{
 if(!perBucket)return found;
 const buckets=new Map();
 for(const candidate of found){const key=Math.floor(candidate.along/bucketKm);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(candidate);}
 const selected=[];
 for(const list of buckets.values()){
  // Retain both low-detour and high-power alternatives. Pruning is disclosed in the result.
  const byDetour=[...list].sort((a,b)=>a.nearest-b.nearest),byPower=[...list].sort((a,b)=>(b.station._socket?.powerKw||0)-(a.station._socket?.powerKw||0)||a.nearest-b.nearest),byCost=[...list].sort((a,b)=>(a.station._rate??Infinity)-(b.station._rate??Infinity)||a.nearest-b.nearest);
  const keep=new Map();for(let i=0;keep.size<perBucket&&i<list.length;i++)for(const order of [byDetour,byPower,byCost]){if(order[i])keep.set(order[i].station.id,order[i]);if(keep.size>=perBucket)break;}
  selected.push(...keep.values());
 }
 return selected;
 };
 return {add,finish};
}
export function corridorCandidates(stations,route,options={}) {const selection=createCorridorSelection(route,options);for(const station of stations)selection.add(station);return selection.finish();}

class Heap {
 constructor(compare){this.items=[];this.compare=compare;}
 push(item){const a=this.items;a.push(item);let i=a.length-1;while(i){const p=(i-1)>>1;if(this.compare(a[p],item)<=0)break;a[i]=a[p];i=p;}a[i]=item;}
 pop(){const a=this.items,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&this.compare(a[c+1],a[c])<0)c++;if(this.compare(last,a[c])<=0)break;a[i]=a[c];i=c;}a[i]=last;}return first;}
 get size(){return this.items.length;}
}
function compareScore(a,b,mode){if(mode==='cheap'){if(Math.abs(a.unknown-b.unknown)>EPS)return a.unknown-b.unknown;if(Math.abs(a.cost-b.cost)>EPS)return a.cost-b.cost;}return a.time-b.time;}
const pointKey=p=>p.map(n=>n.toFixed(6)).join(',');
function plannerControl(signal,deadlineMs,yieldIntervalMs) {
 const controller=new AbortController(),deadline=Date.now()+deadlineMs;let lastYield=Date.now();
 const cancelled=()=>{const reason=signal?.reason;controller.abort(reason instanceof PlanningError?reason:new PlanningError(reason?.name==='TimeoutError'?'Cálculo incompleto: se agotó el tiempo disponible.':'Cálculo cancelado.',reason?.name==='TimeoutError'?'SEARCH_INCOMPLETE':'CANCELLED'));};
 if(signal?.aborted)cancelled();else signal?.addEventListener('abort',cancelled,{once:true});
 const timeout=()=>controller.abort(new PlanningError('Cálculo incompleto: se agotó el tiempo disponible. Prueba un itinerario más corto o vuelve a intentarlo.','SEARCH_INCOMPLETE'));
 const timer=setTimeout(timeout,Math.max(0,deadlineMs));
 const check=()=>{if(Date.now()>=deadline&&!controller.signal.aborted)timeout();if(controller.signal.aborted)throw controller.signal.reason;};
 return {
  signal:controller.signal,check,abort:reason=>controller.abort(reason),
  async yield(force=false){check();if(force||Date.now()-lastYield>=yieldIntervalMs){await new Promise(resolve=>setTimeout(resolve,0));lastYield=Date.now();check();}},
  async run(operation){
   check();let aborted;
   const interrupted=new Promise((_,reject)=>{aborted=()=>reject(controller.signal.reason);controller.signal.addEventListener('abort',aborted,{once:true});});
   try{return await Promise.race([Promise.resolve().then(()=>{check();return operation(controller.signal);}),interrupted]);}
   finally{controller.signal.removeEventListener('abort',aborted);}
  },
  dispose(){clearTimeout(timer);signal?.removeEventListener('abort',cancelled);}
 };
}
const validMetric=value=>value===null||(value&&Number.isFinite(value.km)&&value.km>=0&&Number.isFinite(value.minutes)&&value.minutes>=0);
const edgeKey=(a,b)=>pointKey(a)+'>'+pointKey(b);
export async function planTrip({origin,destinations,stations,vehicle,batteryKwh,consumptionKwh,soc,reserve,mode='cheap',maximumPower=0,connectorFilters=[],provider,quote=(_station,_kwh)=>null,connectionMinutes=5,perBucket=6,onProgress=(_message)=>{},maxStates=500000,signal=null,deadlineMs=30000,maxMatrixPoints=50,maxRoadRequests=20,yieldIntervalMs=8}) {
 if(!Array.isArray(destinations)||destinations.length<1||destinations.length>3)throw new PlanningError('Introduce entre uno y tres destinos.','INVALID_INPUT');
 if(![batteryKwh,consumptionKwh,soc,reserve,connectionMinutes,deadlineMs,maxMatrixPoints,maxRoadRequests,yieldIntervalMs].every(Number.isFinite)||!(batteryKwh>0&&batteryKwh<=250&&consumptionKwh>0&&consumptionKwh<=80&&soc>reserve&&soc<=100&&reserve>=0&&connectionMinutes>=0&&deadlineMs>=0&&maxMatrixPoints>=2&&maxRoadRequests>=1&&yieldIntervalMs>=0))throw new PlanningError('Revisa batería, consumo, SOC, reserva y límites de cálculo.','INVALID_INPUT');
 const points=[origin,...destinations];for(const p of points)if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>90||Math.abs(p[1])>180)throw new PlanningError('Coordenadas no válidas.','INVALID_INPUT');
 const control=plannerControl(signal,deadlineMs,yieldIntervalMs);
 let logicalRequests=0,roadQueries=0;
 const query=async(method,args)=>{
  control.check();
  if(logicalRequests>=maxRoadRequests)throw new PlanningError('Cálculo incompleto: se alcanzó el presupuesto de consultas de carretera. No se ha demostrado que la ruta sea imposible.','SEARCH_INCOMPLETE');
  logicalRequests++;
  return control.run(activeSignal=>method.call(provider,...args,{signal:activeSignal}));
 };
 try{
  control.check();
  const stages=[];let considered=0;
  // Most local journeys need no charging. Avoid scanning/download-dependent station lists for them.
  for(let i=0;i<destinations.length;i++){
   onProgress('Comprobando carretera de la etapa '+(i+1)+'…');
   const baseline=await query(provider.route,[points[i],points[i+1],true]);
   if(!baseline)throw new PlanningError('No se ha encontrado conexión por carretera en la etapa '+(i+1)+'.','NO_ROAD_ROUTE');
   if(!validMetric(baseline)||!Array.isArray(baseline.coordinates)||baseline.coordinates.length<2)throw new PlanningError('Respuesta de carretera incompleta.','ROUTING_SERVICE');
   stages.push({nodes:[],baseline});
  }
  const directKm=stages.reduce((sum,s)=>sum+s.baseline.km,0);
  if(batteryKwh*soc/100-directKm*consumptionKwh/100+EPS>=batteryKwh*reserve/100){
   let energy=batteryKwh*soc/100;const arrivals=[],coordinates=[];
   for(let i=0;i<stages.length;i++){const baseline=stages[i].baseline;energy-=baseline.km*consumptionKwh/100;arrivals.push({stage:i,soc:energy/batteryKwh*100});coordinates.push(...(coordinates.length?baseline.coordinates.slice(1):baseline.coordinates));}
   const minutes=stages.reduce((sum,s)=>sum+s.baseline.minutes,0);
   return {km:directKm,driveMinutes:minutes,chargingMinutes:0,totalMinutes:minutes,cost:0,unknownPriceStops:0,arrivalSoc:energy/batteryKwh*100,arrivals,stops:[],coordinates,complete:true,exploredStates:0,roadQueries:0,logicalRequests,candidateStations:0,consideredStations:0,limitations:LIMITATIONS};
  }
  const selectedStations=[];
  for(let i=0;i<stations.length;i++){
   const station=stations[i];
   if(eligibleForMode(station,vehicle,{mode,maximumPower,connectorFilters}))selectedStations.push({...station,_socket:compatibleSocket(station,vehicle,connectorFilters),_rate:quote(station,1)?.total??null});
   if(i%1000===0)await control.yield();
  }
  for(let i=0;i<stages.length;i++){
   onProgress('Seleccionando alternativas de la etapa '+(i+1)+'…');
   const selection=createCorridorSelection(stages[i].baseline,{perBucket});
   for(let j=0;j<selectedStations.length;j++){selection.add(selectedStations[j]);if(j%500===0)await control.yield();}
   const candidates=selection.finish().sort((a,b)=>a.along-b.along);considered+=selectedStations.length;
   stages[i].nodes=[{point:points[i],kind:'start'},...candidates.map(x=>({point:[x.station.lat,x.station.lng],kind:'station',station:x.station})),{point:points[i+1],kind:'target'}];
   await control.yield();
  }
  const minimumEnergy=batteryKwh*reserve/100,step=(batteryKwh-minimumEnergy)/100,minimum=0,initial=Math.floor((batteryKwh*soc/100-minimumEnergy)/step+EPS),maxRange=(batteryKwh-minimumEnergy)*100/consumptionKwh;
  const metricCache=new Map(),outgoingCache=new Map();
  for(let i=0;i<stages.length;i++)metricCache.set(edgeKey(points[i],points[i+1]),{km:stages[i].baseline.km,minutes:stages[i].baseline.minutes});
  // Prefetch directed road tables in overlapping blocks. A 69-node stage requires three
  // <=50-point matrices, instead of one request for each of its 69 origins.
  if(typeof provider.matrix==='function'){
   const storeTable=(batch,table,required=null)=>{
    if(!Array.isArray(table)||table.length!==batch.length||table.some(row=>!Array.isArray(row)||row.length!==batch.length||row.some(cell=>!validMetric(cell))))throw new PlanningError('La matriz de carreteras está incompleta o contiene valores inválidos.','ROUTING_SERVICE');
    // Commit only after validating the entire response; undefined never means no road.
    for(let i=0;i<batch.length;i++)for(let j=0;j<batch.length;j++){const key=edgeKey(batch[i],batch[j]);if((!required||required.has(key))&&!metricCache.has(key))metricCache.set(key,table[i][j]);}
   };
   const sharedPoints=[...new Map(stages.flatMap(stage=>stage.nodes).map(node=>[pointKey(node.point),node.point])).values()];
   if(sharedPoints.length<=maxMatrixPoints){
    // Short multi-stage journeys share a single directed matrix. Stage-specific nodes still
    // enforce the mandatory destinations; this only combines the road-data request.
    const needsTable=stages.some(stage=>stage.nodes.slice(0,-1).some((from,index)=>stage.nodes.slice(1).some((to,targetIndex)=>index!==targetIndex+1&&haversine(from.point,to.point)<=maxRange+EPS&&!metricCache.has(edgeKey(from.point,to.point)))));
    if(needsTable){onProgress('Comprobando carreteras de todas las etapas · matriz 1…');const table=await query(provider.matrix,[sharedPoints,sharedPoints]);roadQueries++;storeTable(sharedPoints,table);await control.yield();}
   }
   for(let stageIndex=0;stageIndex<stages.length;stageIndex++){
    const nodes=stages[stageIndex].nodes,unique=[...new Map(nodes.map(node=>[pointKey(node.point),node.point])).values()],required=new Set();
    for(let i=0;i<nodes.length-1;i++){for(let j=1;j<nodes.length;j++)if(i!==j&&haversine(nodes[i].point,nodes[j].point)<=maxRange+EPS)required.add(edgeKey(nodes[i].point,nodes[j].point));if(i%16===0)await control.yield();}
    const missing=(a,b)=>required.has(edgeKey(a,b))&&!metricCache.has(edgeKey(a,b));
    const load=async(batch)=>{
     if(!batch.some(a=>batch.some(b=>missing(a,b))))return;
     onProgress('Comprobando carreteras de la etapa '+(stageIndex+1)+' · matriz '+(roadQueries+1)+'…');
     const table=await query(provider.matrix,[batch,batch]);roadQueries++;
     storeTable(batch,table,required);
     await control.yield();
    };
    if(unique.length<=maxMatrixPoints)await load(unique);
    else{
     const size=Math.floor(maxMatrixPoints/2),groups=[];for(let i=0;i<unique.length;i+=size)groups.push(unique.slice(i,i+size));
     for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
      if(groups[i].some(a=>groups[j].some(b=>missing(a,b)||missing(b,a))))await load([...groups[i],...groups[j]]);
      await control.yield();
     }
     // Isolated blocks still need their internal edges; other blocks were covered above.
     for(const group of groups)await load(group);
    }
    for(const key of required)if(!metricCache.has(key))throw new PlanningError('Cálculo incompleto: quedan tramos de carretera sin comprobar.','SEARCH_INCOMPLETE');
    await control.yield();
   }
  }
  const outgoing=async(stage,index)=>{
   const cacheKey=stage+':'+index;if(outgoingCache.has(cacheKey))return outgoingCache.get(cacheKey);
   const nodes=stages[stage].nodes,from=nodes[index],choices=[];
   for(let j=1;j<nodes.length;j++)if(j!==index&&haversine(from.point,nodes[j].point)<=maxRange+EPS)choices.push({index:j,node:nodes[j]});
   const pending=choices.filter(x=>!metricCache.has(edgeKey(from.point,x.node.point)));
   if(pending.length){
    if(typeof provider.matrix==='function')throw new PlanningError('Cálculo incompleto: faltan tramos de la matriz de carreteras.','SEARCH_INCOMPLETE');
    // Compatibility for older/custom providers, bounded by the same deadline and budget.
    onProgress('Comprobando tramos de la etapa '+(stage+1)+'…');roadQueries++;
    const metrics=provider.metrics?await query(provider.metrics,[from.point,pending.map(x=>x.node.point)]):await Promise.all(pending.map(x=>query(provider.route,[from.point,x.node.point,false])));
    if(!Array.isArray(metrics)||metrics.length!==pending.length||metrics.some(metric=>!validMetric(metric)))throw new PlanningError('Respuesta incompleta del servicio de rutas.','ROUTING_SERVICE');
    for(let i=0;i<pending.length;i++)metricCache.set(edgeKey(from.point,pending[i].node.point),metrics[i]);
   }
   const result=choices.map(x=>({...x,metric:metricCache.get(edgeKey(from.point,x.node.point))})).filter(x=>x.metric!==null).map(x=>({...x,units:Math.ceil(x.metric.km*consumptionKwh/100/step-EPS)})).filter(x=>x.units<=100-minimum);
   outgoingCache.set(cacheKey,result);return result;
  };
  const chargeQuotes=new Map(),chargeCurves=new Map();
  const stepCharge=(station,energy)=>{const curveKey=station._socket.powerKw+':'+Number(station._socket.ac);let curve=chargeCurves.get(curveKey);if(!curve){curve=Array.from({length:100},(_,index)=>chargingMinutes(station._socket,minimumEnergy+index*step,minimumEnergy+(index+1)*step,batteryKwh));chargeCurves.set(curveKey,curve);}if(!chargeQuotes.has(station.id))chargeQuotes.set(station.id,quote(station,step));return {minutes:curve[energy],estimate:chargeQuotes.get(station.id)};};
  const best=new Map(),frontiers=new Map(),heap=new Heap((a,b)=>compareScore(a,b,mode)),stateKey=s=>s.stage+':'+s.node+':'+s.energy+':'+Number(s.plugged),frontierKey=s=>s.stage+':'+s.node+':'+Number(s.plugged);
  const initialState={stage:0,node:0,energy:initial,plugged:false,time:0,cost:0,unknown:0,parent:null,action:null};best.set(stateKey(initialState),initialState);frontiers.set(frontierKey(initialState),Object.assign([],{[initial]:initialState}));heap.push(initialState);let final=null,explored=0;
  const add=(parent,values,action)=>{
   const state={...parent,...values,parent,action},key=stateKey(state),old=best.get(key);if(old&&compareScore(state,old,mode)>=-EPS)return;
   const groupKey=frontierKey(state),frontier=frontiers.get(groupKey)||[];
   // More energy with an equal/better objective dominates a weaker state at the same node.
   for(let i=state.energy;i<=100;i++)if(frontier[i]&&compareScore(frontier[i],state,mode)<=EPS)return;
   for(let i=0;i<state.energy;i++)if(frontier[i]&&compareScore(state,frontier[i],mode)<=EPS){best.delete(stateKey(frontier[i]));frontier[i]=undefined;}
   frontier[state.energy]=state;frontiers.set(groupKey,frontier);best.set(key,state);heap.push(state);
  };
  onProgress('Optimizando recargas y reserva de las '+stages.length+' etapas…');
  while(heap.size){
   const state=heap.pop();if(best.get(stateKey(state))!==state)continue;
   if(++explored>maxStates)throw new PlanningError('Cálculo incompleto: se alcanzó el límite de estados de búsqueda. No se ha demostrado que la ruta sea imposible.','SEARCH_INCOMPLETE');
   if(explored%64===0)await control.yield();
   const stage=stages[state.stage],node=stage.nodes[state.node];
   if(node.kind==='target'){
    if(state.stage===stages.length-1){final=state;break;}
    add(state,{stage:state.stage+1,node:0,plugged:false},{kind:'destination',stage:state.stage});continue;
   }
   if(node.kind==='station'&&state.energy<100){
    const kwh=step,charge=stepCharge(node.station,state.energy),estimate=charge.estimate,known=estimate&&Number.isFinite(estimate.total)&&estimate.total>=0;
    const minutes=charge.minutes+(state.plugged?0:connectionMinutes);
    add(state,{energy:state.energy+1,plugged:true,time:state.time+minutes,cost:state.cost+(known?estimate.total:0),unknown:state.unknown+(known?0:kwh)},{kind:'charge',station:node.station,target:minimumEnergy+(state.energy+1)*step,stage:state.stage});
   }
   for(const edge of await outgoing(state.stage,state.node))if(state.energy-edge.units>=minimum)add(state,{node:edge.index,energy:state.energy-edge.units,plugged:false,time:state.time+edge.metric.minutes},{kind:'drive',from:node.point,to:edge.node.point,metric:edge.metric,stage:state.stage,toKind:edge.node.kind});
  }
  control.check();
  if(!final)throw new PlanningError('No se ha encontrado una secuencia alcanzable con la reserva, el catálogo y el corredor seleccionados. Prueba otros filtros o un itinerario distinto; esto no demuestra que no existan cargadores fuera del catálogo.','NO_FEASIBLE_PLAN');
  const actions=[];for(let s=final;s.parent;s=s.parent)actions.push(s.action);actions.reverse();
  const events=[];for(const action of actions){const previous=events[events.length-1];if(action.kind==='charge'&&previous?.kind==='charge'&&previous.station.id===action.station.id&&previous.stage===action.stage)previous.target=action.target;else events.push({...action});}
  const drives=events.filter(event=>event.kind==='drive'),itineraryMethod=provider.itinerary||provider.path;let itinerary=null;
  onProgress('Verificando trazado final y reserva de cada tramo…');
  if(itineraryMethod&&drives.length){
   itinerary=await query(itineraryMethod,[[drives[0].from,...drives.map(drive=>drive.to)]]);
   if(!itinerary||!Array.isArray(itinerary.coordinates)||itinerary.coordinates.length<2||!Array.isArray(itinerary.legs)||itinerary.legs.length!==drives.length||itinerary.legs.some(leg=>leg===null||!validMetric(leg)))throw new PlanningError('No se pudo comprobar el itinerario completo; no se muestra una ruta parcial.','ROUTING_SERVICE');
  }
  let energy=batteryKwh*soc/100,km=0,driveMinutes=0,chargeMinutes=0,cost=0,unknownPriceStops=0,driveIndex=0;const stops=[],arrivals=[],coordinates=itinerary?[...itinerary.coordinates]:[];
  for(const event of events){
   if(event.kind==='drive'){
    const full=itinerary?itinerary.legs[driveIndex]:await query(provider.route,[event.from,event.to,true]);driveIndex++;
    if(!full||!validMetric(full)||(!itinerary&&(!Array.isArray(full.coordinates)||full.coordinates.length<2)))throw new PlanningError('No se pudo obtener el trazado completo; no se muestra una ruta parcial.','ROUTING_SERVICE');
    if(Math.abs(full.km-event.metric.km)>Math.max(.2,event.metric.km*.005))throw new PlanningError('El servicio ha cambiado la distancia del tramo durante el cálculo. Vuelve a calcular para validar la autonomía.','ROUTE_CHANGED');
    energy-=full.km*consumptionKwh/100;if(energy+EPS<minimumEnergy)throw new PlanningError('La comprobación final no conserva la reserva. Vuelve a calcular el viaje.','ENERGY_VALIDATION');
    km+=full.km;driveMinutes+=full.minutes;
    if(!itinerary)coordinates.push(...(coordinates.length?full.coordinates.slice(1):full.coordinates));
    if(event.toKind==='target')arrivals.push({stage:event.stage,soc:energy/batteryKwh*100});
   }else if(event.kind==='charge'){
    const amount=Math.max(0,event.target-energy);if(amount<=EPS)continue;
    const minutes=chargingMinutes(event.station._socket,energy,event.target,batteryKwh)+connectionMinutes;
    const estimate=quote(event.station,amount),known=estimate&&Number.isFinite(estimate.total)&&estimate.total>=0;
    stops.push({station:event.station,stage:event.stage,kwh:amount,minutes,arrivalSoc:energy/batteryKwh*100,departureSoc:event.target/batteryKwh*100,quote:known?estimate:null,socket:event.station._socket});
    chargeMinutes+=minutes;if(known)cost+=estimate.total;else unknownPriceStops++;energy=event.target;
   }
   await control.yield();
  }
  return {km,driveMinutes,chargingMinutes:chargeMinutes,totalMinutes:driveMinutes+chargeMinutes,cost,unknownPriceStops,arrivalSoc:energy/batteryKwh*100,arrivals,stops,coordinates,complete:true,exploredStates:explored,roadQueries,logicalRequests,candidateStations:stages.reduce((sum,s)=>sum+s.nodes.length-2,0),consideredStations:considered,limitations:LIMITATIONS};
 }catch(error){control.abort(error);throw error;}finally{control.dispose();}
}
