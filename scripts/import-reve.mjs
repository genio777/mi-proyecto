// REVE official API: server-side only. Never publish the API key.
// Runs in GitHub Actions; 4 requests/hour maximum, with persistent cursor.
import fs from 'node:fs';
const catalogPath='public/data/chargers-spain.json';
const cachePath='public/data/reve-cache.json';
const key=process.env.REVE_API_KEY;
if(!key){console.log('REVE: configure repository Actions secret REVE_API_KEY to enable sync');process.exit(0)}
const now=Date.now(),hour=3600000;
const read=(p,defaultValue)=>{try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch{return defaultValue}};
const cache=read(cachePath,{cursor:1,totalPages:0,lastAttempt:0,locations:{},lastSuccess:null});
if(now-Number(cache.lastAttempt||0)<hour){console.log('REVE: hourly request budget reserved; skipping');process.exit(0)}
cache.lastAttempt=now; // persist attempts, including HTTP errors, to avoid 429 loops
const save=()=>fs.writeFileSync(cachePath,JSON.stringify(cache));
const normalized=(s)=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
function connectorType(raw){
 const t=normalized(raw);
 if(['IEC62196T2COMBO','CCS','CCS2'].includes(t))return 'CCS';
 if(t.includes('CHADEMO'))return 'CHAdeMO';
 if(['IEC62196T2','TYPE2','TIPO2','MENNEKES'].includes(t))return 'Tipo2';
 return null;
}
function parseLocation(loc){
 if(!loc||typeof loc.id!=='string')return null;
 const lat=Number(loc.coordinates?.latitude),lng=Number(loc.coordinates?.longitude);
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<27||lat>44.6||lng< -18.5||lng>4.6)return null;
 const connectors=[];
 for(const evse of Array.isArray(loc.evses)?loc.evses:[]){
  for(const con of Array.isArray(evse.connectors)?evse.connectors:[]){
   const type=connectorType(con.standard||con.type||con.connector_type);
   const watts=Number(con.max_electric_power),powerKw=watts/1000;
   if(type&&Number.isFinite(powerKw)&&powerKw>0&&powerKw<=1000)connectors.push({type,powerKw:Math.round(powerKw*10)/10,officialConnectorId:con.id||null,price:null});
  }
 }
 if(!connectors.length)return null; // do not invent connector types or power
 const operator=String(loc.owner||loc.cpo_name||'').split(' - ')[0].trim();
 return {id:'reve:'+loc.id,name:String(loc.name||operator||'Punto REVE'),city:String(loc.city||''),province:String(loc.region||''),address:String(loc.address||''),operator,lat,lng,power:Math.max(...connectors.map(c=>c.powerKw)),connector:[...new Set(connectors.map(c=>c.type))].join(', '),connectors,price:null,priceSource:null,priceVerifiedAt:null,source:'REVE API · Red Eléctrica de España',verified:'Datos declarados por operador; no comprobados presencialmente',availability:'Desconocida',reveUpdated:loc.last_updated||null};
}
try{
 let page=Math.max(1,Number(cache.cursor)||1),pages=Number(cache.totalPages)||0;
 for(let i=0;i<4;i++){
  if(pages>0&&page>pages)page=1;
  const url='https://www.mapareve.es/api/external/v1/locations?page='+page+'&limit=100';
  const res=await fetch(url,{headers:{'x-api-key':key,'Accept':'application/json'},signal:AbortSignal.timeout(45000)});
  if(res.status===429){console.warn('REVE rate limit: wait until next hour');break}
  if(!res.ok){console.warn('REVE HTTP '+res.status+' on page '+page);break}
  const data=await res.json();
  if(!Array.isArray(data))throw Error('REVE returned non-array locations response');
  pages=Number(res.headers.get('total-pages'))||pages;
  let accepted=0;
  for(const loc of data){const station=parseLocation(loc);if(station){cache.locations[station.id]=station;accepted++}}
  console.log('REVE page',page,'received',data.length,'valid connectors',accepted,'total pages',pages);
  page++;cache.lastSuccess=new Date().toISOString();
  if(data.length<100&&pages===0)break;
 }
 cache.cursor=page;cache.totalPages=pages;
}catch(e){console.warn('REVE sync failed:',e instanceof Error?e.message:String(e))}
save();
const catalog=read(catalogPath,null);
if(!catalog||!Array.isArray(catalog.chargers))throw Error('DGT catalog missing');
const existing=new Set(catalog.chargers.map(c=>c.id));
for(const station of Object.values(cache.locations))if(!existing.has(station.id))catalog.chargers.push(station);
catalog.reveApi={source:'Red Eléctrica de España · mapa REVE',lastSuccess:cache.lastSuccess,records:Object.keys(cache.locations).length,notice:'Datos REVE sujetos a licencia no comercial; disponibilidad y precios no garantizados'};
fs.writeFileSync(catalogPath,JSON.stringify(catalog));
console.log('REVE merged:',catalog.reveApi.records,'locations; last success:',cache.lastSuccess);
