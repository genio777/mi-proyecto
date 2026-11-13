// Incremental Open Charge Map import across Europe, Asia and Russia.
// Official REVE/DGT data for Spain is retained. No inferred free prices.
import fs from 'node:fs';
import path from 'node:path';
const file='public/data/chargers-spain.json';
const previous='data/chargers-spain.json';
const root='/tmp/ocm-export/data';
const catalog=JSON.parse(fs.readFileSync(file,'utf8'));
const existing=new Set(catalog.chargers.map(c=>String(c.id)));
if(fs.existsSync(previous)){
 const old=JSON.parse(fs.readFileSync(previous,'utf8'));
 for(const c of old.chargers||[])if(String(c.id).startsWith('ocm-global-')&&!existing.has(c.id)){catalog.chargers.push(c);existing.add(c.id)}
}
const connector=id=>({25:'Tipo2',28:'Schuko',2:'CHAdeMO',33:'CCS',1036:'CCS',1:'Tipo1',27:'Tesla'}[id]||null);
const countries=(process.env.OCM_COUNTRIES||'').split(',').filter(Boolean);
let added=0,updated=0,reviewed=0;
for(const country of countries){
 const dir=path.join(root,country);
 if(!fs.existsSync(dir)){console.log('OCM country not present:',country);continue}
 for(const filename of fs.readdirSync(dir)){
  if(!filename.endsWith('.json'))continue;
  reviewed++;
  let p;try{p=JSON.parse(fs.readFileSync(path.join(dir,filename),'utf8'))}catch{continue}
  if(p.SubmissionStatusTypeID!==200||p.StatusTypeID===100||!p.AddressInfo)continue;
  const a=p.AddressInfo,lat=Number(a.Latitude),lng=Number(a.Longitude);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)continue;
  const cs=(p.Connections||[]).filter(c=>Number(c.PowerKW)>0&&Number(c.PowerKW)<=1000&&connector(c.ConnectionTypeID));
  if(!cs.length)continue;
  const id='ocm-global-'+country+'-'+p.ID;
  const text=String(p.UsageCost||'').trim().toLowerCase();
  const free=/^(free|free of charge|gratis|gratuit|kostenlos|бесплатно|無料|0(?:[.,]0+)?\\s*(?:€|eur)?)\\.?$/.test(text);
  const station={id,name:String(a.Title||'Open Charge Map'),city:String(a.Town||''),province:String(a.StateOrProvince||''),address:String(a.AddressLine1||''),country,lat,lng,power:Math.max(...cs.map(c=>Number(c.PowerKW))),connector:[...new Set(cs.map(c=>connector(c.ConnectionTypeID)))].join(', '),connectors:cs.map(c=>({type:connector(c.ConnectionTypeID),powerKw:Number(c.PowerKW),price:null})),price:free?0:null,operator:String(p.OperatorInfo?.Title||''),source:'Open Charge Map · '+country+' · '+p.ID,verified:String(p.DateLastVerified||p.DateLastStatusUpdate||''),availability:'No verificada en tiempo real',condition:free?'Gratuidad declarada por OCM; confirmar condiciones y vigencia.':'Tarifa no verificada; no se supone gratuidad.'};
  if(existing.has(id)){const i=catalog.chargers.findIndex(c=>c.id===id);if(i>=0){catalog.chargers[i]=station;updated++}}
  else{catalog.chargers.push(station);existing.add(id);added++}
 }
}
catalog.internationalSource={name:'Open Charge Map',countriesUpdated:countries,updatedAt:new Date().toISOString(),recordsReviewed:reviewed,added,updated,notice:'Cobertura progresiva; datos comunitarios no garantizan disponibilidad, precios ni acceso.'};
fs.writeFileSync(file,JSON.stringify(catalog));
console.log('International OCM:',JSON.stringify(catalog.internationalSource));
