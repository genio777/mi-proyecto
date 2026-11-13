import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

// Site power and a Tesla name do not prove a CCS2 socket. The previous Niek
// supplement has no declared data licence and contains no socket identities.
// Keep Tesla sites from the official/attributed catalogues without adding
// sockets or changing the rating of an AC socket from a site's maximum power.
export function auditTeslaCatalog(catalog){
 if(!Array.isArray(catalog?.chargers))throw Error('Official catalog unavailable');
 let removedUnlicensed=0,repairedLegacyRatings=0;
 catalog.chargers=catalog.chargers.filter(station=>{
  if(/Niek community dataset/i.test(String(station.source||''))){removedUnlicensed++;return false}
  if(/Niek community dataset/i.test(String(station.powerSource||''))){
   const connectors=Array.isArray(station.connectors)?station.connectors:[];
   const rated=connectors.filter(c=>Number.isFinite(c.powerKw)&&c.powerKw>0);
   if(rated.length){
    station.power=Math.max(...rated.map(c=>c.powerKw));
    station.connector=[...new Set(connectors.map(c=>c.type).filter(Boolean))].join(', ');
   }
   delete station.powerSource;
   delete station.powerVerified;
   repairedLegacyRatings++;
  }
  return true;
 });
 const sites=catalog.chargers.filter(c=>/tesla/i.test(String(c.operator||'')+' '+String(c.name||'')));
 catalog.teslaSourceAudit={
  checkedAt:new Date().toISOString(),sites:sites.length,removedUnlicensed,repairedLegacyRatings,
  notice:'Tesla se conserva desde DGT/REVE y fuentes con licencia por registro. No se infieren conectores, acceso para otras marcas, precio ni disponibilidad a partir del nombre o de la potencia del emplazamiento.',
  excludedSupplement:{url:'https://github.com/Niek/tesla-superchargers',reason:'Sin licencia de datos declarada y sin conectores por toma; no se redistribuye.'}
 };
 return catalog;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const file=process.env.CHARGER_CATALOG_PATH||'public/data/chargers-spain.json';
 const catalog=auditTeslaCatalog(JSON.parse(await readFile(file,'utf8')));
 await writeFile(file,JSON.stringify(catalog));
 console.log('Tesla catalog audit:',JSON.stringify(catalog.teslaSourceAudit));
}
