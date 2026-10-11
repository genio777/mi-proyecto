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
const report={updated:new Date().toISOString(),note:'Solo candidatos para revisión. Ninguna coincidencia implica precio cero.',groups:[]};
for(const group of groups){
 const stations=catalog.chargers.filter(c=>{
  const name=String(c.name||'')+' '+String(c.operator||'');
  return group.terms.some(term=>name.toLowerCase().includes(term));
 }).map(c=>({id:c.id,name:c.name,city:c.city,province:c.province,address:c.address,operator:c.operator,power:c.power,price:c.price,verification:'pending'}));
 report.groups.push({name:group.name,source:group.source,conditions:group.conditions,status:group.status,verificationRequirements:conditionsByOperator[group.name],count:stations.length,stations});
 console.log(group.name+': '+stations.length+' candidates, zero verified free by this audit');
}
await mkdir('public/data',{recursive:true});
await writeFile('public/data/price-audit-candidates.json',JSON.stringify(report));
console.log('Audit report generated; routing prices unchanged');
