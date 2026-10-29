import fs from 'node:fs';
import path from 'node:path';
const catalogPath='public/data/chargers-spain.json';
const sourceDir=process.env.OCM_ES_DIR||'/tmp/ocm-export/data/ES';
const catalog=JSON.parse(fs.readFileSync(catalogPath,'utf8'));
if(!Array.isArray(catalog.chargers))throw Error('Catálogo nacional ausente');
if(!fs.existsSync(sourceDir))throw Error('No se descargó la fuente europea OCM');
const freeEvidence=(s)=>{if(typeof s!=='string')return false;const t=s.trim().toLowerCase().replace(/\s+/g,' ');
 if(/\b(no gratuito|no gratis|not free|not gratis|gratis con|free with|free for|free if|free only|free parking|aparcamiento gratis|parking gratuito|excepto|salvo|minimum|compra|consumici[oó]n|tarifa|subscription|suscripci[oó]n|cliente|customers|members|registro|registered)\b/i.test(t))return false;
 return /^(?:gratis|gratuito|gratuita|free|free of charge|no charge|sin coste|sin cargo|sin coste de recarga|0[.,]00?\s*€\s*\/\s*kwh|€\s*0(?:[.,]00?)?\s*\/\s*kwh|0(?:[.,]00?)?\s*€\s*\/\s*kwh|€\s*0(?:[.,]00?)?)\.?$/i.test(t);
};
const connector=(id)=>({25:'Tipo2',28:'Schuko',2:'CHAdeMO',33:'CCS',1036:'CCS',1:'Tipo1'}[id]||null);
const existing=new Set(catalog.chargers.map(c=>c.id));
const near=(a,b)=>Math.abs(a.lat-b.lat)<0.00025&&Math.abs(a.lng-b.lng)<0.00025;
let files=0,explicit=0,added=0,duplicate=0,stale=0;
const now=Date.now();
for(const filename of fs.readdirSync(sourceDir)){
 if(!filename.endsWith('.json'))continue;files++;
 let p;try{p=JSON.parse(fs.readFileSync(path.join(sourceDir,filename),'utf8'))}catch{continue}
 const lidl=/\\blidl\\b/i.test(String(p.AddressInfo?.Title||''))&&p.OperatorID===38;
 const officialLidlAddresses=['carretera de carmona','alcalde manuel de valle','kansas city','jose perez marti','avenida ingenieria','calle luna'];
 const titleAddr=[p.AddressInfo?.Title,p.AddressInfo?.AddressLine1].join(' ').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();
 const officialLidlSeville=lidl&&/seville|sevilla/i.test(String(p.AddressInfo?.Town||''))&&officialLidlAddresses.some(x=>titleAddr.includes(x));
 const explicitFree=freeEvidence(p.UsageCost);
 if((!explicitFree&&!officialLidlSeville)||p.SubmissionStatusTypeID!==200||p.StatusTypeID!==50)continue;
 explicit++;
 const date=Date.parse(p.DateLastVerified||p.DateLastStatusUpdate||'');
 if(!officialLidlSeville&&(!Number.isFinite(date)||now-date>365*2*86400000)){stale++;continue}
 const a=p.AddressInfo||{},lat=Number(a.Latitude),lng=Number(a.Longitude);
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<35||lat>44||lng< -10||lng>5)continue;
 const cs=(p.Connections||[]).filter(c=>c.StatusTypeID===50&&Number(c.PowerKW)>0&&connector(c.ConnectionTypeID));
 if(!cs.length)continue;
 const id='ocm-'+p.ID;
 if(existing.has(id)||catalog.chargers.some(c=>near(c,{lat,lng})&&c.price===0)){duplicate++;continue}
 const best=cs.sort((x,y)=>Number(y.PowerKW)-Number(x.PowerKW))[0];
 const c={id,name:String(a.Title||'Punto gratuito OCM'),city:String(a.Town||'Localidad sin especificar'),lat,lng,power:Number(best.PowerKW),connector:[...new Set(cs.map(x=>connector(x.ConnectionTypeID)))].join(','),price:0,source:officialLidlSeville?'Lidl España · 30 minutos gratis durante la compra; localización Open Charge Map '+p.ID:'Open Charge Map · registro '+p.ID+' · UsageCost: '+p.UsageCost,verified:p.DateLastVerified||p.DateLastStatusUpdate,operator:officialLidlSeville?'Lidl':'Open Charge Map (operador sin verificar)',address:String(a.AddressLine1||''),province:String(a.StateOrProvince||''),condition:officialLidlSeville?'Lidl España anuncia 30 minutos gratis mientras compras. Ubicación/potencia OCM antigua: verificar antes de viajar. NO equivale a carga ilimitada.':'Gratuidad declarada en Open Charge Map, NO comprobada en tiempo real. Verificar acceso, horario y precio en destino.'};
 catalog.chargers.push(c);existing.add(id);added++;
}
catalog.freeEuropeanSource={name:'Open Charge Map',url:'https://github.com/openchargemap/ocm-export',checkedAt:new Date().toISOString(),recordsReviewed:files,explicitFree:explicit,staleRejected:stale,duplicatesRejected:duplicate,imported:added,disclaimer:'Gratuidad declarada por la fuente, no garantizada en tiempo real. Se excluyen registros ambiguos y antiguos.'};
fs.writeFileSync(catalogPath,JSON.stringify(catalog));
console.log('OCM España:',JSON.stringify(catalog.freeEuropeanSource));
