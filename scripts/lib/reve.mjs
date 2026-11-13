// Contract verified against https://www.mapareve.es/api/external/v1/docs/api-docs.json
const names={IEC62196T2COMBO:'CCS',IEC62196T2:'Tipo2',CHADEMO:'CHAdeMO',IEC62196T1:'Tipo1',IEC62196T1COMBO:'CCS1',GBTAC:'GB/T AC',GBTDC:'GB/T DC',DOMESTICF:'Schuko'};
const text=(v,max=500)=>typeof v==='string'?v.trim().slice(0,max):'';
const number=v=>v!==null&&v!==''&&v!==undefined?Number(v):NaN;
export function parseReveLocation(location,importedAt=new Date().toISOString()) {
 if(!text(location?.id))return null;
 const lat=number(location.coordinates?.latitude),lng=number(location.coordinates?.longitude);
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<27||lat>44.6||lng< -18.5||lng>4.6||location.country&&location.country!=='ESP')return null;
 const connectors=[];
 for(const evse of Array.isArray(location.evses)?location.evses:[]){
  for(const connector of Array.isArray(evse.connectors)?evse.connectors:[]){
   const type=names[text(connector.standard).toUpperCase().replace(/[^A-Z0-9]/g,'')];
   const powerKw=number(connector.max_electric_power)/1000;
   // max_electric_power is optional in the public schema. Omitting an unknown
   // rating is safer than presenting voltage*amps as a measured connector limit.
   if(!type||!Number.isFinite(powerKw)||powerKw<=0)continue;
   const powerType=text(connector.power_type);
   if(type==='Tipo2'&&powerType==='DC')continue;
   connectors.push({type,powerKw,officialConnectorId:text(connector.id)||null,officialEvseId:text(evse.evse_id)||null,sourceEvseId:text(evse.id)||null,powerType:powerType==='DC'?'DC':powerType.startsWith('AC_')?'AC':undefined,price:null,sourceUpdatedAt:text(connector.last_static_updated)||null});
  }
 }
 if(!connectors.length)return null;
 const operator=text(location.cpo_name)||text(location.owner).split(' - ')[0];
 return {id:'reve:'+text(location.id),name:text(location.name)||operator||'Punto REVE',city:text(location.city),province:text(location.region),address:text(location.address),country:'ES',operator,lat,lng,power:Math.max(...connectors.map(c=>c.powerKw)),connector:[...new Set(connectors.map(c=>c.type))].join(', '),connectors,price:null,priceSource:null,priceVerifiedAt:null,source:'REVE API · Red Eléctrica de España',sourceUrl:'https://www.mapareve.es/',licenseNotice:'Condiciones de uso de REVE / Red Eléctrica',licenseUrl:'https://www.ree.es/es/aviso-legal',verified:'Datos declarados por operador; no comprobados presencialmente',availability:'Desconocida',reveUpdated:text(location.last_updated)||null,importedAt};
}
export function sanitizeReveCache(raw={}) {
 const locations={};
 // Older cache entries are accepted only when they retain explicit connector
 // identity/power. Never keep raw API responses or credential-bearing headers.
 for(const [id,c]of Object.entries(raw.locations||{})){
  if(!id.startsWith('reve:')||c?.id!==id||!Number.isFinite(c.lat)||!Number.isFinite(c.lng)||c.lat<27||c.lat>44.6||c.lng< -18.5||c.lng>4.6||!Array.isArray(c.connectors))continue;
  const connectors=c.connectors.filter(x=>typeof x.type==='string'&&Number.isFinite(x.powerKw)&&x.powerKw>0).map(x=>({type:x.type,powerKw:x.powerKw,officialConnectorId:text(x.officialConnectorId)||null,officialEvseId:text(x.officialEvseId)||null,sourceEvseId:text(x.sourceEvseId)||null,powerType:['AC','DC'].includes(x.powerType)?x.powerType:undefined,price:null,sourceUpdatedAt:text(x.sourceUpdatedAt)||null}));
  if(!connectors.length)continue;
  // Recreate an allowlisted public record, dropping any extra cache properties.
  const kept={id,name:text(c.name),city:text(c.city),province:text(c.province),address:text(c.address),country:'ES',operator:text(c.operator),lat:c.lat,lng:c.lng,power:Math.max(...connectors.map(x=>x.powerKw)),connector:[...new Set(connectors.map(x=>x.type))].join(', '),connectors,price:null,priceSource:null,priceVerifiedAt:null,source:'REVE API · Red Eléctrica de España',sourceUrl:'https://www.mapareve.es/',licenseNotice:'Condiciones de uso de REVE / Red Eléctrica',licenseUrl:'https://www.ree.es/es/aviso-legal',verified:'Datos declarados por operador; no comprobados presencialmente',availability:'Desconocida',reveUpdated:text(c.reveUpdated)||null,importedAt:text(c.importedAt)||null};
  locations[id]=kept;
 }
 const cursor=Math.max(1,Math.trunc(Number(raw.cursor)||1));
 let cycle=null;
 if(raw.cycle?.version===1&&raw.cycle.expectedPage===cursor&&Number.isFinite(Date.parse(raw.cycle.startedAt))&&Array.isArray(raw.cycle.seenIds)&&raw.cycle.seenIds.every(id=>typeof id==='string'&&id.startsWith('reve:')&&id.length<=505))cycle={version:1,startedAt:raw.cycle.startedAt,expectedPage:cursor,seenIds:[...new Set(raw.cycle.seenIds)]};
 return {cursor,totalPages:Math.max(0,Math.trunc(Number(raw.totalPages)||0)),lastAttempt:Math.max(0,Number(raw.lastAttempt)||0),lastSuccess:text(raw.lastSuccess)||null,retryAfter:Math.max(0,Number(raw.retryAfter)||0),lastCompletedCycle:text(raw.lastCompletedCycle)||null,cycle,locations};
}
