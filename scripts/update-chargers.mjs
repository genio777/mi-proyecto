import fs from 'node:fs/promises';

const PAGE='https://energia.serviciosmin.gob.es/Ripree/ExportarInstalaciones/Export';
const html=await (await fetch(PAGE)).text();
const hrefs=[...html.matchAll(/href=["']([^"']+)["']/gi)].map(m=>new URL(m[1],PAGE).href);
const candidates=[...new Set(hrefs.filter(x=>/export|csv|descarg|instal/i.test(x)))];
if(!candidates.length) throw new Error('No se encontró una descarga candidata RIPREE');
let raw='',used='';
for(const url of candidates){try{const res=await fetch(url,{headers:{Accept:'text/csv,application/csv,application/octet-stream;q=0.9,*/*;q=0.5'}});if(!res.ok)continue;const body=await res.text();const ct=res.headers.get('content-type')||'';if(!/^\s*<!doctype|^\s*<html/i.test(body)&&(/csv|octet-stream|text\/plain/i.test(ct)||body.includes(';')||body.includes(','))){raw=body;used=url;break}}catch{}}
if(!raw)throw new Error('El portal RIPREE devolvió HTML en lugar del CSV; no se sobrescribe la base local');

function parseCSV(text){
 const first=text.split(/\r?\n/,1)[0]||'';
 const sep=(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?';':',';
 const rows=[];let row=[],cell='',q=false;
 for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(q&&text[i+1]==='"'){cell+='"';i++}else q=!q}else if(ch===sep&&!q){row.push(cell);cell=''}else if((ch==='\n'||ch==='\r')&&!q){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell=''}else cell+=ch}
 if(cell||row.length){row.push(cell);rows.push(row)}return rows;
}
const rows=parseCSV(raw);if(rows.length<2)throw new Error('CSV RIPREE vacío');
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'');
const heads=rows[0].map(norm);
const idx=(...keys)=>{for(const k of keys){const n=norm(k),i=heads.findIndex(h=>h===n||h.includes(n));if(i>=0)return i}return-1};
const ilat=idx('latitud','latitude'), ilon=idx('longitud','longitude'), iname=idx('nombre instalacion','denominacion','nombre'), iaddr=idx('direccion','emplazamiento'), icity=idx('municipio','localidad'), iprov=idx('provincia'), iop=idx('operador','titular explotacion','empresa'), ipow=idx('potencia','potencia maxima'), icon=idx('conector','tipo conector');
if(ilat<0||ilon<0)throw new Error('RIPREE cambió el esquema: faltan latitud/longitud. Cabeceras: '+rows[0].join(' | '));
const num=v=>Number(String(v||'').trim().replace(',','.').replace(/[^0-9.\-]/g,''));
const chargers=[];
for(let n=1;n<rows.length;n++){const r=rows[n],lat=num(r[ilat]),lng=num(r[ilon]);if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<27||lat>44.5||lng<-19||lng>5)continue;const p=ipow>=0?num(r[ipow]):0;chargers.push({id:'ripree-'+n,name:(iname>=0?r[iname]:'')||'Punto de recarga público',city:(icity>=0?r[icity]:'')||'',province:(iprov>=0?r[iprov]:'')||'',address:(iaddr>=0?r[iaddr]:'')||'',lat,lng,power:Number.isFinite(p)?p:0,connector:(icon>=0?r[icon]:'')||'Consultar',operator:(iop>=0?r[iop]:'')||'No indicado',price:null,availability:'UNKNOWN',source:'MITECO · RIPREE',verified:new Date().toISOString().slice(0,10)})}
if(chargers.length<100)throw new Error('Importación sospechosa: solo '+chargers.length+' puntos');
await fs.mkdir('public/data',{recursive:true});
await fs.writeFile('public/data/chargers-spain.json',JSON.stringify({updated:new Date().toISOString(),source:used||PAGE,count:chargers.length,chargers}));
console.log('RIPREE:',chargers.length,'puntos');
