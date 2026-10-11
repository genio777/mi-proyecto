import {readFile,writeFile,mkdir} from 'node:fs/promises';
const catalog=JSON.parse(await readFile('public/data/chargers-spain.json','utf8'));
if(!Array.isArray(catalog.chargers))throw Error('Catalog missing');
const groups=[
 {name:'Lidl',terms:['lidl'],source:'https://empresa.lidl.es/',conditions:'Posible promoción limitada a 30 minutos durante la compra; confirmar tienda y vigencia',status:'conditional_candidate'},
 {name:'Carrefour',terms:['carrefour'],source:'https://www.carrefour.es/',conditions:'Existen cargadores de pago; consultar precio individual',status:'price_required'},
 {name:'EMT Madrid',terms:['electroemt','emt madrid','empresa municipal de transportes'],source:'https://www.emtmadrid.es/',conditions:'Condiciones específicas por aparcamiento y conector; confirmar tarifa',status:'manual_review'},
 {name:'Municipales',terms:['ayuntamiento','municipal'],source:'https://www.mapareve.es/',conditions:'Consultar condiciones y precio del municipio y punto',status:'manual_review'}
];
const conditionsByOperator={
 Lidl:{eligibility:'Promoción condicionada a compra y tiempo; no apta para ruta 0 EUR sin restricciones',source:'https://empresa.lidl.es/',review:'Confirmar ubicación exacta, minutos gratuitos, potencia y cargos tras el límite'},
 Carrefour:{eligibility:'No se presupone gratuidad',source:'https://www.carrefour.es/',review:'Confirmar precio por conector y medio de pago'},
 'EMT Madrid':{eligibility:'Depende de aparcamiento y tipo de conector',source:'https://www.emtmadrid.es/',review:'Confirmar tarifa y condiciones de acceso por punto'},
 Municipales:{eligibility:'Depende de ordenanza y operador local',source:'https://www.mapareve.es/',review:'Confirmar ordenanza, tarifa actual y acceso público'}
};
const evidence=JSON.parse(await readFile('data/station-evidence.json','utf8'));
const normalize=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const confirmed=JSON.parse(await readFile('data/verified-station-prices.json','utf8'));
const confirmedById=new Map(confirmed.prices.map(row=>[row.id,row]));
const valid=confirmed.prices.filter(row=>Date.now()-Date.parse(row.checkedAt)>=0&&Date.now()-Date.parse(row.checkedAt)<=7*86400000);
const report={updated:new Date().toISOString(),note:'Solo candidatos para revisión. Ninguna coincidencia implica precio cero.',groups:[]};
for(const group of groups){
 const stations=catalog.chargers.filter(c=>{
  const name=String(c.name||'')+' '+String(c.operator||'');
  return group.terms.some(term=>name.toLowerCase().includes(term));
 }).map(c=>({id:c.id,name:c.name,city:c.city,province:c.province,address:c.address,operator:c.operator,power:c.power,connector:c.connector,lat:c.lat,lng:c.lng,price:c.price,verification:'pending',stationPriceSource:confirmedById.get(String(c.id))?.sourceUrl||null,stationCheckedAt:confirmedById.get(String(c.id))?.checkedAt||null,requiresPurchase:confirmedById.get(String(c.id))?.requiresPurchase??null,timeLimitMinutes:confirmedById.get(String(c.id))?.timeLimitMinutes??null,hasExtraFees:confirmedById.get(String(c.id))?.hasExtraFees??null,publicAccess:confirmedById.get(String(c.id))?.publicAccess??null}));
 report.groups.push({name:group.name,source:group.source,conditions:group.conditions,status:group.status,verificationRequirements:conditionsByOperator[group.name],count:stations.length,stations});
 console.log(group.name+': '+stations.length+' candidates, zero verified free by this audit');
}
report.locationEvidence=evidence.records.map(row=>{
 const matches=catalog.chargers.filter(c=>normalize(c.city)===normalize(row.city)&&normalize(c.address).includes(normalize(row.address).slice(0,12))).map(c=>({id:c.id,name:c.name,address:c.address,operator:c.operator,connector:c.connector,power:c.power}));
 return {...row,matchingCatalogStations:matches,matchCount:matches.length,matchStatus:matches.length===1?'candidate_unique':matches.length===0?'not_found':'ambiguous',nextAction:matches.length===1?'Verify connector and full station-specific tariff':matches.length===0?'Find matching station in national catalog':'Resolve multiple stations before assigning price',eligibleForZeroEuroRouting:false};
});
report.verifiedPriceCount=valid.length;
report.verifiedFreeCount=valid.filter(row=>row.price===0).length;
await mkdir('public/data',{recursive:true});
await writeFile('public/data/price-audit-candidates.json',JSON.stringify(report));
console.log('Audit report generated with coordinates, connectors and individual verification fields; routing prices unchanged');
