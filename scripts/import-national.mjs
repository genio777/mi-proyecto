import {mkdir,writeFile} from 'node:fs/promises';
const url='https://nap.dgt.es/datex2/v3/miterd/EnergyInfrastructureTablePublication/electrolineras.xml';
const r=await fetch(url);if(!r.ok)throw Error('DGT HTTP '+r.status);
const xml=await r.text();console.log('DGT XML bytes:',xml.length,'sites tags:',xml.split('<egi:energyInfrastructureSite ').length-1);
const get=(s,t)=>s.match(new RegExp('<'+t+'[^>]*>([^<]*)</'+t+'>'))?.[1]?.trim()||'';
const clean=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'");
const names={iec62196T2COMBO:'CCS',chademo:'CHAdeMO',iec62196T2:'Tipo2'};
const sites=[];for(const raw of xml.split('<egi:energyInfrastructureSite ').slice(1)){
 const s=raw.split('</egi:energyInfrastructureSite>')[0];
 const id=s.match(/^id="([^"]+)"/)?.[1];const lat=parseFloat(get(s,'loc:latitude')),lng=parseFloat(get(s,'loc:longitude'));
 if(!id||!Number.isFinite(lat)||!Number.isFinite(lng)||lat<27||lat>44.6||lng< -18.5||lng>4.6)continue;
 const conn=[];for(const c of s.split('<egi:connector>').slice(1)){
  const type=names[get(c,'egi:connectorType')];const power=Number(get(c,'egi:maxPowerAtSocket'))/1000;
  if(type&&power>0&&power<=1000)conn.push([type,Math.round(power*10)/10]);
 }
 if(!conn.length)continue;
 const n=s.indexOf('<fac:name>');const name=n>=0?clean(get(s.slice(n),'com:value')):'Punto de recarga';
 const city=clean(s.match(/Municipio: ([^<]*)/)?.[1]||'');
 const province=clean(s.match(/Provincia: ([^<]*)/)?.[1]||'');
 const address=clean(s.match(/Dirección: ([^<]*)/)?.[1]||'');
 const opStart=s.indexOf('<fac:operator');const opBlock=opStart>=0?s.slice(opStart).split('</fac:operator>')[0]:'';
 const operator=opBlock.includes('<fac:name>')?clean(get(opBlock.slice(opBlock.indexOf('<fac:name>')),'com:value')):'';
 sites.push([id,name,lat,lng,city,conn,province,address,operator]);
}
if(sites.length<5000)throw Error('Importación incompleta: '+sites.length+' estaciones');
await mkdir('public/data',{recursive:true});
const now=new Date().toISOString();
await writeFile('public/data/chargers-spain.json',JSON.stringify({updated:now,source:'DGT MITERD REVE DATEX II',chargers:sites.map(([id,name,lat,lng,city,conns,province,address,operator])=>({id,name,city,province,address,operator,lat,lng,power:Math.max(...conns.map(c=>c[1])),connector:[...new Set(conns.map(c=>c[0]))].join(', '),price:null,source:'DGT MITERD REVE',verified:'No verificada individualmente',availability:'Desconocida'}))}));
console.log('Imported official stations:',sites.length);