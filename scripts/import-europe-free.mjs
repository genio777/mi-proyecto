import fs from 'node:fs';
import path from 'node:path';

// Fuente europea abierta: Open Charge Map. No deducir gratuidad por ausencia de tarifa.
const catalogPath='public/data/chargers-spain.json';
const sourceDir=process.env.OCM_ES_DIR||'/tmp/ocm-export/data/ES';
const catalog=JSON.parse(fs.readFileSync(catalogPath,'utf8'));
if(!Array.isArray(catalog.chargers))throw Error('Catálogo nacional ausente');
if(!fs.existsSync(sourceDir))throw Error('Fuente OCM no disponible');
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const freeEvidence=(p)=>{
 const cost=norm(p.UsageCost);
 const freeUsageType=p.UsageTypeID===4; // OCM: Public - Membership Required? NO usar como prueba
 if(!cost)return false;
 if(/(?:no gratis|no gratuito|not free|not gratis|free parking|parking gratis|aparcamiento gratis|no free|con compra|purchase|customer only|solo clientes|suscrip|subscription|tarifa|precio|€\s*[1-9]|[1-9][0-9]*\s*€)/.test(cost))return false;
 return /^(?:gratis|gratuito|gratuita|free|free of charge|no charge|sin coste|sin cargo|sin coste de recarga|0(?:[.,]0+)?\s*(?:€|eur)(?:\s*\/\s*kwh)?|(?:€|eur)\s*0(?:[.,]0+)?(?:\s*\/\s*kwh)?)\.?$/.test(cost);
};
const connector=id=>({25:'Tipo2',28:'Schuko',2:'CHAdeMO',33:'CCS',1036:'CCS',1:'Tipo1',27:'Tesla'}[id]||null);
const existing=new Set(catalog.chargers.map(c=>String(c.id)));
const key=(lat,lng)=>Math.round(lat*10000)+':'+Math.round(lng*10000);
const existingFreeCoords=new Set(catalog.chargers.filter(c=>c.price===0&&Number.isFinite(c.lat)&&Number.isFinite(c.lng)).map(c=>key(c.lat,c.lng)));
let files=0,explicit=0,added=0,duplicates=0,old=0,conditions=0;
const now=Date.now();
for(const filename of fs.readdirSync(sourceDir)){
 if(!filename.endsWith('.json'))continue;files++;
 let p;try{p=JSON.parse(fs.readFileSync(path.join(sourceDir,filename),'utf8'))}catch{continue}
 if(p.SubmissionStatusTypeID!==200||p.StatusTypeID!==50||!freeEvidence(p))continue;
 explicit++;
 const a=p.AddressInfo||{},lat=Number(a.Latitude),lng=Number(a.Longitude);
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<35||lat>44||lng< -10||lng>5)continue;
 const cs=(p.Connections||[]).filter(c=>(c.StatusTypeID===50||c.StatusTypeID==null)&&Number(c.PowerKW)>0&&connector(c.ConnectionTypeID));
 if(!cs.length)continue;
 const id='ocm-'+p.ID,coord=key(lat,lng);
 if(existing.has(id)||existingFreeCoords.has(coord)){duplicates++;continue}
 const verified=p.DateLastVerified||p.DateLastStatusUpdate||'';
 const age=now-Date.parse(verified);
 const isOld=!Number.isFinite(age)||age>365*2*86400000;
 if(isOld)old++;
 const best=cs.reduce((a,b)=>Number(a.PowerKW)>Number(b.PowerKW)?a:b);
 const access=String(p.GeneralComments||'').slice(0,240);
 if(access)conditions++;
 catalog.chargers.push({
  id,name:String(a.Title||'Punto de recarga OCM'),city:String(a.Town||'Localidad sin especificar'),
  lat,lng,power:Number(best.PowerKW),connector:[...new Set(cs.map(c=>connector(c.ConnectionTypeID)))].join(','),
  price:0,operator:String(p.OperatorInfo?.Title||'Operador no confirmado'),
  source:'Open Charge Map · registro '+p.ID+' · gratuidad declarada: '+p.UsageCost,
  verified,address:String(a.AddressLine1||''),province:String(a.StateOrProvince||''),
  condition:(isOld?'AVISO: dato de gratuidad antiguo; requiere confirmación. ':'Gratuidad declarada; no confirmada en tiempo real. ')+
   'Consultar precio, límites, horario y acceso antes de desplazarse.'+(access?' Notas: '+access:'')
 });
 existing.add(id);existingFreeCoords.add(coord);added++;
}
catalog.freeEuropeanSource={
 name:'Open Charge Map',url:'https://github.com/openchargemap/ocm-export',
 checkedAt:new Date().toISOString(),recordsReviewed:files,explicitFree:explicit,
 imported:added,oldRecordsFlagged:old,duplicatesRejected:duplicates,withAccessNotes:conditions,
 disclaimer:'Gratuidad declarada, no garantizada. Los datos antiguos se señalan, no se descartan; no se infiere precio cero de tarifa ausente.'
};
fs.writeFileSync(catalogPath,JSON.stringify(catalog));
console.log('Importación gratuita europea:',JSON.stringify(catalog.freeEuropeanSource));
