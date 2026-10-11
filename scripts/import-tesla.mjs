import {readFile,writeFile} from 'node:fs/promises';
const file='public/data/chargers-spain.json';
const url='https://raw.githubusercontent.com/Niek/tesla-superchargers/main/superchargers-with-pricing.json';
const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
if(!response.ok)throw Error('Tesla community catalog HTTP '+response.status);
const raw=await response.json();
const entries=Array.isArray(raw)?raw:Object.entries(raw).map(([id,v])=>({...v,id}));
const base=JSON.parse(await readFile(file,'utf8'));
if(!Array.isArray(base.chargers))throw Error('Official catalog unavailable');
const existing=base.chargers;
const distanceMeters=(a,b)=>{
 const rad=Math.PI/180,dLat=(a.lat-b.lat)*rad,dLng=(a.lng-b.lng)*rad;
 const h=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLng/2)**2;
 return 12742000*Math.asin(Math.min(1,Math.sqrt(h)));
};
const isTesla=c=>/tesla/i.test(String(c.operator||'')+' '+String(c.name||''));
const safeId=v=>String(v).replace(/[^a-z0-9-]/gi,'-');
const ids=new Set(existing.map(c=>String(c.id)));
let added=0,duplicates=0,nearOtherOperators=0;
for(const t of entries){
 const lat=Number(t.location?.latitude??t.latitude),lng=Number(t.location?.longitude??t.longitude);
 const name=String(t.name||'').trim(),power=Number(t.power);
 if(!name||!Number.isFinite(lat)||!Number.isFinite(lng)||lat<27||lat>44.6||lng< -18.5||lng>4.6||!Number.isFinite(power)||power<30||power>500)continue;
 if(t.type&&t.type!=='SITE_TYPE_SUPERCHARGER')continue;
 const candidate={lat,lng};
 // Unificar solo estaciones Tesla a menos de 100 m; no mezclar operadores.
 const match=existing.find(c=>isTesla(c)&&distanceMeters(candidate,c)<=100);
 if(match){
  duplicates++;
  // El catálogo nacional puede registrar una toma AC de baja potencia en la
  // misma ubicación. No utilizarla como potencia del Supercharger CCS.
  // La potencia comunitaria solo corrige el cálculo del Supercharger Tesla,
  // nunca se presenta como potencia medida o disponibilidad en tiempo real.
  if(power>=50&&match.power<50){
   match.power=power;
   match.connector=[...new Set([...String(match.connector||'').split(',').map(x=>x.trim()).filter(Boolean),'CCS'])].join(', ');
   match.powerSource='Tesla Superchargers - Niek community dataset (potencia nominal no verificada en tiempo real)';
   match.powerVerified=false;
  }
  continue;
 }
 if(existing.some(c=>!isTesla(c)&&distanceMeters(candidate,c)<=100))nearOtherOperators++;
 const baseId='tesla-'+safeId(t.id||name);
 let id=baseId,serial=2;
 while(ids.has(id))id=baseId+'-'+serial++;
 ids.add(id);
 existing.push({id,name:'Tesla Supercharger - '+name,city:name.split(',')[0],province:'',address:'',operator:'Tesla',lat,lng,power,connector:'CCS',price:null,priceSource:null,priceVerifiedAt:null,source:'Tesla Superchargers - Niek community dataset',verified:'Ubicacion sin verificar individualmente',availability:'Desconocida'});
 added++;
}
if(added===0&&duplicates===0)throw Error('No Tesla stations imported: check source and geographic filters');
base.sources=[base.source,'Niek/tesla-superchargers community (Tesla sites)'];base.updated=new Date().toISOString();
await writeFile(file,JSON.stringify(base));
console.log('Tesla stations added:',added,'Tesla duplicates omitted:',duplicates,'other operators nearby retained:',nearOtherOperators,'total:',existing.length);
