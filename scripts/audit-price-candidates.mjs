import {readFile} from 'node:fs/promises';
const catalog=JSON.parse(await readFile('public/data/chargers-spain.json','utf8'));
if(!Array.isArray(catalog.chargers))throw Error('Catalog missing');
const candidates=catalog.chargers.filter(c=>/\b(EMT|Empresa Municipal de Transportes)\b/i.test(String(c.operator||''))&&/Madrid/i.test([c.city,c.province,c.address].join(' ')));
console.log('EMT Madrid candidates (not classified as free):',candidates.length);
for(const c of candidates.slice(0,40))console.log(JSON.stringify({id:c.id,name:c.name,operator:c.operator,city:c.city,address:c.address,power:c.power,price:c.price}));
console.log('Official conditions: https://www.emtmadrid.es/emting/eulaelectroemt.aspx');
console.log('IMPORTANT: EMT free tariff applies only to slow chargers in specific managed parking facilities; no station is marked free without a matched station-specific verification.');
