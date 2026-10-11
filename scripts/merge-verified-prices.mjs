import {readFile,writeFile} from 'node:fs/promises';
const file='public/data/chargers-spain.json';
const source='data/verified-station-prices.json';
const catalog=JSON.parse(await readFile(file,'utf8'));
const overlay=JSON.parse(await readFile(source,'utf8'));
if(!Array.isArray(catalog.chargers)||!Array.isArray(overlay.prices))throw Error('Invalid price input');
const byId=new Map(catalog.chargers.map(c=>[String(c.id),c]));
const seen=new Set();
let applied=0,missing=0;
for(const row of overlay.prices){
 if(!row||typeof row.id!=='string'||seen.has(row.id))throw Error('Duplicate or invalid tariff id');
 seen.add(row.id);
 if(typeof row.sourceUrl!=='string'||!/^https:\/\//.test(row.sourceUrl)||!Number.isFinite(Date.parse(row.checkedAt)))throw Error('Unverified tariff: '+row.id);
 if(typeof row.price!=='number'||!Number.isFinite(row.price)||row.price<0||row.unit!=='EUR/kWh')throw Error('Invalid price/unit: '+row.id);
 if(row.hasExtraFees!==false)throw Error('Additional fees or uncertain total price: '+row.id);
 if(row.price===0&&(row.requiresPurchase!==false||row.timeLimitMinutes!==null||row.membershipRequired!==false||row.publicAccess!==true))throw Error('Conditional free tariff cannot be used for unrestricted 0 EUR routes: '+row.id);
 if(typeof row.stationEvidence!=='string'||row.stationEvidence.trim().length<12)throw Error('Missing station-specific evidence: '+row.id);
 const age=Date.now()-Date.parse(row.checkedAt);
 if(age<0||age>7*86400000)throw Error('Tariff expired (7 days): '+row.id);
 const station=byId.get(row.id);
 if(!station){missing++;continue}
 station.price=row.price;
 station.priceSource=row.sourceUrl;
 station.priceVerifiedAt=row.checkedAt;
 applied++;
}
if(missing)throw Error('Tariff station IDs absent from current catalog: '+missing);
await writeFile(file,JSON.stringify(catalog));
console.log('Station-specific verified prices applied:',applied,'unknown:',catalog.chargers.filter(c=>c.price===null).length);
