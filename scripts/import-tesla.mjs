import {readFile,writeFile} from 'node:fs/promises';
const file='public/data/chargers-spain.json';
const url='https://raw.githubusercontent.com/Niek/tesla-superchargers/main/superchargers-with-pricing.json';
const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
if(!response.ok)throw Error('Tesla community catalog HTTP '+response.status);
const raw=await response.json();
const entries=Array.isArray(raw)?raw:Object.entries(raw).map(([id,v])=>({...v,id}));
const base=JSON.parse(await readFile(file,'utf8'));
if(!Array.isArray(base.chargers)||base.chargers.length<5000)throw Error('Official catalog unavailable');
const existing=base.chargers;
let added=0,duplicates=0;
for(const t of entries){
 const lat=Number(t.location?.latitude??t.latitude),lng=Number(t.location?.longitude??t.longitude);
 const name=String(t.name||'').trim(),power=Number(t.power);
 if(!name||!Number.isFinite(lat)||!Number.isFinite(lng)||lat<27||lat>44.6||lng< -18.5||lng>4.6||!Number.isFinite(power)||power<30||power>500)continue;
 if(t.type&&t.type!=='SITE_TYPE_SUPERCHARGER')continue;
 const near=existing.find(c=>Math.abs(c.lat-lat)<.002&&Math.abs(c.lng-lng)<.002);
 if(near){duplicates++;if(/tesla/i.test(near.operator||'')||/tesla/i.test(near.name||'')){near.power=Math.max(near.power,power);near.operator='Tesla';}continue}
 existing.push({id:'tesla-'+String(t.id||name).replace(/[^a-z0-9-]/gi,'-'),name:'Tesla Supercharger - '+name,city:name.split(',')[0],province:'',address:'',operator:'Tesla',lat,lng,power,connector:'CCS',price:null,source:'Tesla Superchargers - Niek community dataset',verified:'Ubicacion sin verificar individualmente',availability:'Desconocida'});
 added++;
}
if(added===0&&duplicates===0)throw Error('No valid Tesla locations in source');
base.sources=[base.source,'Niek/tesla-superchargers community (Tesla sites)'];base.updated=new Date().toISOString();
await writeFile(file,JSON.stringify(base));
console.log('Tesla stations added:',added,'near duplicates:',duplicates,'total:',existing.length);
