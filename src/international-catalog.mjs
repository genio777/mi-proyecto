// Country files are published, licence-reviewed snapshots, never live inventory.
const validPoint = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;
const intersects = (a,b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
function paddedBox(a,b,radiusKm) {
  const latitude = Math.min(89,Math.max(Math.abs(a[0]),Math.abs(b[0])));
  const dy = radiusKm/110, dx = Math.min(180,radiusKm/(110*Math.max(.02,Math.cos(latitude*Math.PI/180))));
  return [Math.max(-180,Math.min(a[1],b[1])-dx),Math.max(-90,Math.min(a[0],b[0])-dy),Math.min(180,Math.max(a[1],b[1])+dx),Math.min(90,Math.max(a[0],b[0])+dy)];
}
export function routeBounds(points,radiusKm=50) {
  if (!Array.isArray(points) || !points.length || !points.every(validPoint)) throw Error('Coordenadas inválidas para cargar el catálogo internacional');
  if (!Number.isFinite(radiusKm) || radiusKm < 0 || radiusKm > 250) throw Error('Radio internacional inválido');
  const boxes=[];
  for(let i=0;i<points.length;i++) {
    const a=points[i], b=points[Math.min(i+1,points.length-1)];
    if(Math.abs(a[1]-b[1])>180) {
      const west=a[1]<0?a:b,east=a[1]>=0?a:b;
      boxes.push(paddedBox(west,[east[0],-180],radiusKm),paddedBox(east,[west[0],180],radiusKm));
    } else boxes.push(paddedBox(a,b,radiusKm));
  }
  return boxes;
}
export function selectCountries(manifest,points,radiusKm=50) {
  const boxes=routeBounds(points,radiusKm);
  return manifest.countries.filter(country=>country.count>0&&Array.isArray(country.bbox)&&boxes.some(box=>intersects(box,country.bbox)));
}
function validateManifest(data) {
  if(data?.schemaVersion!==1 || !Array.isArray(data.countries)) throw Error('Formato de índice internacional no compatible');
  const ids=new Set();
  for(const row of data.countries) {
    if(row?.count===0&&row.bbox===null&&/^[A-Z]{2}$/.test(row.code)&&row.file===row.code+'.json'&&!ids.has(row.code)){ids.add(row.code);continue;}
    if(!/^[A-Z]{2}$/.test(row?.code)||row.file!==row.code+'.json'||ids.has(row.code)||!Number.isSafeInteger(row.count)||row.count<0||!Array.isArray(row.bbox)||row.bbox.length!==4||!row.bbox.every(Number.isFinite)||row.bbox[0]<-180||row.bbox[2]>180||row.bbox[1]<-90||row.bbox[3]>90||row.bbox[0]>row.bbox[2]||row.bbox[1]>row.bbox[3])throw Error('País inválido en índice internacional');
    ids.add(row.code);
  }
  return data;
}
function abortIfNeeded(signal) {if(signal?.aborted)throw signal.reason||new DOMException('Cancelado','AbortError');}
export function createInternationalCatalog({fetchFn=(...args)=>fetch(...args),baseUrl='./data/international/',timeoutMs=45000,concurrency=3}={}) {
  let manifestPromise;
  const shards=new Map();
  const getJson=async file=>{
    const response=await fetchFn(baseUrl+file,{signal:AbortSignal.timeout(timeoutMs)});
    if(!response.ok)throw Error('HTTP '+response.status);
    return response.json();
  };
  const loadManifest=()=>{
    if(!manifestPromise)manifestPromise=getJson('index.json').then(validateManifest).catch(error=>{manifestPromise=null;throw error;});
    return manifestPromise;
  };
  const loadCountry=entry=>{
    if(!shards.has(entry.code)) {
      const job=getJson(entry.file).then(data=>{
        if(data?.country!==entry.code||!Array.isArray(data.chargers)||data.chargers.length!==entry.count)throw Error('País o tamaño de archivo no coincide con el índice');
        if(data.chargers.some(c=>!c?.id||c.country!==entry.code||!validPoint([c.lat,c.lng])||!c.sourceUrl||!c.dataProvider?.licenseUrl))throw Error('Registros internacionales inválidos o sin atribución');
        return data.chargers;
      }).catch(error=>{shards.delete(entry.code);throw error;});
      shards.set(entry.code,job);
    }
    return shards.get(entry.code);
  };
  /** @param {Array<[number,number]>} points @param {{radiusKm?:number,signal?:AbortSignal}} options */
  async function loadForPoints(points,{radiusKm=50,signal}={}) {
    abortIfNeeded(signal);
    // Validate input before reading any network data.
    routeBounds(points,radiusKm);
    let manifest;
    try{manifest=await loadManifest();}catch(error){abortIfNeeded(signal);return {stations:[],countries:[],warnings:['No se pudo cargar el índice internacional: '+error.message+'. La cobertura de esta ruta no está verificada.']};}
    abortIfNeeded(signal);
    const selected=selectCountries(manifest,points,radiusKm),results=[],warnings=[],loaded=[];
    let cursor=0;
    await Promise.all(Array.from({length:Math.min(Math.max(1,concurrency),selected.length)},async()=>{
      while(cursor<selected.length) {
        abortIfNeeded(signal);
        const entry=selected[cursor++];
        try{const stations=await loadCountry(entry);for(const station of stations)results.push(station);loaded.push(entry.code);}
        catch(error){warnings.push('No se pudo cargar el catálogo '+entry.code+' ('+error.message+'); no se ha verificado su cobertura.');}
      }
    }));
    abortIfNeeded(signal);
    if(!manifest.countries.length)warnings.push('No hay registros internacionales publicados; la cobertura fuera del catálogo nacional no está verificada.');
    return {stations:[...new Map(results.map(c=>[c.id,c])).values()],countries:loaded.sort(),warnings};
  }
  return {loadManifest,loadForPoints};
}
export const internationalCatalog=createInternationalCatalog();
