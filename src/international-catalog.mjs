// Country files are published, licence-reviewed snapshots, never live inventory.
const validPoint = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;
const intersects = (a,b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
function paddedBoxes(a,b,radiusKm) {
  const latitude = Math.min(89,Math.max(Math.abs(a[0]),Math.abs(b[0])));
  const dy = radiusKm/110, dx = Math.min(180,radiusKm/(110*Math.max(.02,Math.cos(latitude*Math.PI/180))));
  const west=Math.min(a[1],b[1])-dx,east=Math.max(a[1],b[1])+dx,south=Math.max(-90,Math.min(a[0],b[0])-dy),north=Math.min(90,Math.max(a[0],b[0])+dy);
  if(east-west>=360)return [[-180,south,180,north]];
  const boxes=[[Math.max(-180,west),south,Math.min(180,east),north]];
  if(west<=-180)boxes.push([Math.max(-180,west+360),south,180,north]);
  if(east>=180)boxes.push([-180,south,Math.min(180,east-360),north]);
  return boxes;
}
export function routeBounds(points,radiusKm=50) {
  if (!Array.isArray(points) || !points.length || !points.every(validPoint)) throw Error('Coordenadas inválidas para cargar el catálogo internacional');
  if (!Number.isFinite(radiusKm) || radiusKm < 0 || radiusKm > 250) throw Error('Radio internacional inválido');
  const boxes=[];
  for(let i=0;i<points.length;i++) {
    const a=points[i], b=points[Math.min(i+1,points.length-1)];
    if(Math.abs(a[1]-b[1])>180) {
      const west=a[1]<0?a:b,east=a[1]>=0?a:b;
      boxes.push(...paddedBoxes(west,[east[0],-180],radiusKm),...paddedBoxes(east,[west[0],180],radiusKm));
    } else boxes.push(...paddedBoxes(a,b,radiusKm));
  }
  return boxes;
}
function selectForBounds(manifest,boxes,checkBudget=()=>{}) {
  // A country bbox can span mainland and distant territories. Optional cells
  // come from the actual, licence-reviewed records; no country is guessed away.
  let grid;
  const queryGrid=()=>{
    if(!grid){
      grid=new Set();
      for(const box of boxes){checkBudget();for(let x=Math.floor(box[0]);x<=Math.floor(box[2]);x++)for(let y=Math.floor(box[1]);y<=Math.floor(box[3]);y++)grid.add(x+':'+y);}
    }
    return grid;
  };
  return manifest.countries.filter(country=>{
    checkBudget();
    if(!(country.count>0)||!Array.isArray(country.bbox)||!boxes.some(box=>intersects(box,country.bbox)))return false;
    if(!Array.isArray(country.coverageCells))return true; // Older schema-1 indexes.
    return country.coverageCells.some(([x,y])=>queryGrid().has(x+':'+y));
  });
}
export function selectCountries(manifest,points,radiusKm=50) {
  return selectForBounds(manifest,routeBounds(points,radiusKm));
}
function validateManifest(data) {
  if(data?.schemaVersion!==1 || !Array.isArray(data.countries)) throw Error('Formato de índice internacional no compatible');
  const ids=new Set();
  for(const row of data.countries) {
    if(row?.count===0&&row.bbox===null&&/^[A-Z]{2}$/.test(row.code)&&row.file===row.code+'.json'&&!ids.has(row.code)){ids.add(row.code);continue;}
    if(!/^[A-Z]{2}$/.test(row?.code)||row.file!==row.code+'.json'||ids.has(row.code)||!Number.isSafeInteger(row.count)||row.count<0||!Array.isArray(row.bbox)||row.bbox.length!==4||!row.bbox.every(Number.isFinite)||row.bbox[0]<-180||row.bbox[2]>180||row.bbox[1]<-90||row.bbox[3]>90||row.bbox[0]>row.bbox[2]||row.bbox[1]>row.bbox[3])throw Error('País inválido en índice internacional');
    if(row.coverageCells!==undefined){
      if((row.coverageCellDegrees??data.coverageCellDegrees)!==1||!Array.isArray(row.coverageCells)||!row.coverageCells.length||row.coverageCells.some(c=>!Array.isArray(c)||c.length!==2||!c.every(Number.isInteger)||c[0]<-180||c[0]>180||c[1]<-90||c[1]>90||c[0]<Math.floor(row.bbox[0])||c[0]>Math.floor(row.bbox[2])||c[1]<Math.floor(row.bbox[1])||c[1]>Math.floor(row.bbox[3])))throw Error('Celdas de cobertura internacional inválidas');
    }
    ids.add(row.code);
  }
  return data;
}
function abortReason(signal) {return signal.reason??new DOMException('Carga de datos cancelada','AbortError');}
function abortIfNeeded(signal) {if(signal?.aborted)throw abortReason(signal);}
function waitForSignal(promise,signal) {
  abortIfNeeded(signal);
  if(!signal)return promise;
  return new Promise((resolve,reject)=>{
    const abort=()=>{cleanup();reject(abortReason(signal));};
    const cleanup=()=>signal.removeEventListener('abort',abort);
    signal.addEventListener('abort',abort,{once:true});
    promise.then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
    // Covers an abort between the initial check and listener registration.
    if(signal.aborted)abort();
  });
}
function budgetScope(signal,milliseconds) {
  abortIfNeeded(signal);
  if(!Number.isFinite(milliseconds)||milliseconds<=0)throw Error('Presupuesto de carga internacional inválido');
  const controller=new AbortController();
  const forward=()=>controller.abort(abortReason(signal));
  signal?.addEventListener('abort',forward,{once:true});
  const expiresAt=Date.now()+milliseconds;
  const expire=()=>controller.abort(new DOMException('Datos internacionales incompletos: se agotó el tiempo máximo de carga ('+Math.ceil(milliseconds/1000)+' s).','TimeoutError'));
  const timer=setTimeout(expire,milliseconds);
  const check=()=>{if(!controller.signal.aborted&&Date.now()>=expiresAt)expire();abortIfNeeded(controller.signal);};
  return {signal:controller.signal,check,close:()=>{clearTimeout(timer);signal?.removeEventListener('abort',forward);}};
}
export function createInternationalCatalog({fetchFn=(...args)=>fetch(...args),baseUrl='./data/international/',timeoutMs=15000,budgetMs=15000,concurrency=3}={}) {
  let manifestTask,active=0;
  const shards=new Map(),pending=[];
  const limit=Math.max(1,Math.floor(concurrency)||1);
  function releaseSlot(){
    active--;
    while(active<limit&&pending.length){
      const job=pending.shift();
      job.signal.removeEventListener('abort',job.abort);
      if(job.signal.aborted){job.reject(abortReason(job.signal));continue;}
      active++;job.resolve(slotRelease());
    }
  }
  function slotRelease(){let released=false;return()=>{if(!released){released=true;releaseSlot();}};}
  function acquireSlot(signal){
    abortIfNeeded(signal);
    if(active<limit){active++;return Promise.resolve(slotRelease());}
    return new Promise((resolve,reject)=>{
      const job={signal,resolve,reject,abort:null};
      job.abort=()=>{const index=pending.indexOf(job);if(index!==-1)pending.splice(index,1);signal.removeEventListener('abort',job.abort);reject(abortReason(signal));};
      signal.addEventListener('abort',job.abort,{once:true});pending.push(job);
      if(signal.aborted)job.abort();
    });
  }
  async function getJson(file,signal){
    const release=await acquireSlot(signal);
    try{
      abortIfNeeded(signal);
      const response=await waitForSignal(Promise.resolve(fetchFn(baseUrl+file,{signal})),signal);
      if(!response.ok)throw Error('HTTP '+response.status);
      const data=await waitForSignal(Promise.resolve(response.json()),signal);
      abortIfNeeded(signal);return data;
    }finally{release();}
  }
  function sharedTask(file,validate,evict){
    const controller=new AbortController();
    const task={controller,settled:false,consumers:0,promise:null,evict:()=>evict(task)};
    const timer=setTimeout(()=>controller.abort(new DOMException('Tiempo de espera agotado al descargar '+file,'TimeoutError')),timeoutMs);
    task.promise=getJson(file,controller.signal).then(validate).finally(()=>clearTimeout(timer));
    task.promise.then(()=>{task.settled=true;},()=>{task.settled=true;task.evict();});
    return task;
  }
  function consume(task,signal){
    abortIfNeeded(signal);
    task.consumers++;
    return waitForSignal(task.promise,signal).finally(()=>{
      task.consumers--;
      if(!task.consumers&&!task.settled){
        // Evict before aborting. A late rejection must not delete a newer retry.
        task.evict();task.controller.abort(new DOMException('Descarga sin consumidores activos','AbortError'));
      }
    });
  }
  function manifestRecord(){
    if(!manifestTask)manifestTask=sharedTask('index.json',validateManifest,task=>{if(manifestTask===task)manifestTask=null;});
    return manifestTask;
  }
  function countryRecord(entry){
    if(!shards.has(entry.code)){
      const task=sharedTask(entry.file,data=>{
        if(data?.country!==entry.code||!Array.isArray(data.chargers)||data.chargers.length!==entry.count)throw Error('País o tamaño de archivo no coincide con el índice');
        if(data.chargers.some(c=>!c?.id||c.country!==entry.code||!validPoint([c.lat,c.lng])||!c.sourceUrl||!c.dataProvider?.licenseUrl))throw Error('Registros internacionales inválidos o sin atribución');
        return data.chargers;
      },task=>{if(shards.get(entry.code)===task)shards.delete(entry.code);});
      shards.set(entry.code,task);
    }
    return shards.get(entry.code);
  }
  /** @param {{signal?:AbortSignal,budgetMs?:number}} options */
  async function loadManifest({signal,budgetMs:milliseconds=budgetMs}={}){
    const scope=budgetScope(signal,milliseconds);
    try{const data=await consume(manifestRecord(),scope.signal);scope.check();return data;}finally{scope.close();}
  }
  async function loadEntries(manifest,selected,scope,warnings=[]){
    const results=[],loaded=[];let cursor=0;
    await Promise.all(Array.from({length:Math.min(limit,selected.length)},async()=>{
      while(cursor<selected.length){
        scope.check();const entry=selected[cursor++];
        try{const stations=await consume(countryRecord(entry),scope.signal);scope.check();for(const station of stations)results.push(station);loaded.push(entry.code);}
        catch(error){scope.check();warnings.push('No se pudo cargar el catálogo '+entry.code+' ('+error.message+'); no se ha verificado su cobertura.');}
      }
    }));
    scope.check();
    if(!manifest.countries.length)warnings.push('No hay registros internacionales publicados; la cobertura fuera del catálogo nacional no está verificada.');
    const stations=[...new Map(results.map(c=>[c.id,c])).values()];scope.check();
    return {stations,countries:loaded.sort(),warnings};
  }
  /** @param {Array<string>} codes @param {{signal?:AbortSignal,budgetMs?:number}} options */
  async function loadCountries(codes,{signal,budgetMs:milliseconds=budgetMs}={}){
    abortIfNeeded(signal);
    if(!Array.isArray(codes)||codes.length>200||codes.some(code=>typeof code!=='string'||!/^[A-Z]{2}$/.test(code)))throw Error('Códigos de país no válidos para recuperar favoritos.');
    const requested=[...new Set(codes)];if(!requested.length)return {stations:[],countries:[],warnings:[]};
    const scope=budgetScope(signal,milliseconds);
    try{
      let manifest;
      try{manifest=await consume(manifestRecord(),scope.signal);}catch(error){scope.check();return {stations:[],countries:[],warnings:['No se pudo cargar el índice internacional: '+error.message+'. No se han recuperado las fichas de favoritos.']};}
      scope.check();const selected=[],warnings=[];
      for(const code of requested){const entry=manifest.countries.find(country=>country.code===code);if(entry?.count>0)selected.push(entry);else warnings.push('No hay un catálogo con estaciones publicadas para '+code+'. Se conserva el favorito sin inventar su ficha.');}
      return await loadEntries(manifest,selected,scope,warnings);
    }finally{scope.close();}
  }
  /** @param {Array<[number,number]>} points @param {{radiusKm?:number,signal?:AbortSignal,budgetMs?:number}} options */
  async function loadForPoints(points,{radiusKm=50,signal,budgetMs:milliseconds=budgetMs}={}) {
    abortIfNeeded(signal);
    const boxes=routeBounds(points,radiusKm);
    const scope=budgetScope(signal,milliseconds);
    try{
      let manifest;
      try{manifest=await consume(manifestRecord(),scope.signal);}catch(error){scope.check();return {stations:[],countries:[],warnings:['No se pudo cargar el índice internacional: '+error.message+'. La cobertura de esta ruta no está verificada.']};}
      scope.check();
      return await loadEntries(manifest,selectForBounds(manifest,boxes,scope.check),scope);
    }finally{scope.close();}
  }
  return {loadManifest,loadForPoints,loadCountries};
}
export const internationalCatalog=createInternationalCatalog();
