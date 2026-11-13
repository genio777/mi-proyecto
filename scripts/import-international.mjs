// Licence-aware, partitioned OCM import. Run on every build (even with no
// countries) to restore country snapshots after refreshing the national data.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseOcmPoint,validPersistedOcm,OCM_GEOGRAPHY_SOURCE} from './lib/ocm.mjs';
export const SUPPORTED_COUNTRIES='AD AE AF AL AM AT AX AZ BA BD BE BG BH BN BT BY CH CN CY CZ DE DK EE ES FI FO FR GB GE GG GI GR HK HR HU ID IE IL IM IN IQ IR IS IT JE JO JP KG KH KP KR KW KZ LA LB LI LK LT LU LV MC MD ME MK MM MN MO MT MV MY NL NO NP OM PH PK PL PS PT QA RO RS RU SA SE SG SI SJ SK SM SY TH TJ TL TM TR TW UA UZ VA VN XK YE'.split(' ');
const read=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}};
const international=c=>String(c?.id).startsWith('ocm-');
function shard(code,stations,updatedAt,sourceCommit=null) {
 const chargers=[...new Map(stations.filter(validPersistedOcm).filter(c=>c.country===code).map(c=>[c.id,c])).values()];
 return {country:code,updatedAt,source:'https://github.com/openchargemap/ocm-export',sourceCommit,chargers};
}
function entry(part) {
 const stations=part.chargers;
 const providers=[...new Map(stations.map(c=>[c.dataProvider.id,c.dataProvider])).values()];
 let bbox=null;
 if(stations.length){
  let west=180,east=-180,south=90,north=-90;
  for(const c of stations){west=Math.min(west,c.lng);east=Math.max(east,c.lng);south=Math.min(south,c.lat);north=Math.max(north,c.lat);}
  bbox=[west,south,east,north];
 }
 return {code:part.country,file:part.country+'.json',count:stations.length,bbox,updatedAt:part.updatedAt,providers,sourceCommit:part.sourceCommit||null};
}
export function importInternational({catalogPath='public/data/chargers-spain.json',previousPath='data/chargers-spain.json',root=process.env.OCM_DATA_DIR||'/tmp/ocm-export/data',outputDir=path.join(path.dirname(catalogPath),'international'),snapshotDir=process.env.OCM_SNAPSHOT_DIR||'data/international',countries=(process.env.OCM_COUNTRIES||'').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean),now=new Date().toISOString(),sourceCommit=process.env.OCM_SOURCE_COMMIT||null}={}) {
 if(sourceCommit&&!/^[a-f0-9]{40}$/i.test(sourceCommit))throw Error('OCM_SOURCE_COMMIT must be a full Git commit SHA');
 if(countries.some(c=>!SUPPORTED_COUNTRIES.includes(c)))throw Error('OCM_COUNTRIES must contain supported ISO country codes');
 const catalog=read(catalogPath,null);
 if(!Array.isArray(catalog?.chargers))throw Error('Catálogo base ausente');
 const previous=read(previousPath,{chargers:[]}),parts=new Map();
 const report={name:'Open Charge Map',url:'https://github.com/openchargemap/ocm-export',updatedAt:now,sourceCommit,geographyValidation:OCM_GEOGRAPHY_SOURCE,countryReview:{},countriesRequested:[...new Set(countries)],countriesUpdated:[],countriesMissing:[],restored:0,rejectedLegacy:0,recordsReviewed:0,imported:0,rejected:{},notice:'Cobertura según registros publicados por OCM, no exhaustiva. Fecha de importación no acredita precio, acceso ni disponibilidad en tiempo real.'};
 // Migrate earlier aggregate records only if licence, provider and sockets can
 // still be verified. Country files keep each Git object below aggregate size.
 for(const station of [...(previous.chargers||[]),...catalog.chargers]){
  if(!international(station))continue;
  if(!validPersistedOcm(station)){report.rejectedLegacy++;continue;}
  const part=parts.get(station.country)||shard(station.country,[],station.importedAt||now);
  part.chargers.push(station);parts.set(station.country,part);
 }
 // Current output overrides the older published snapshot, preserving deletions.
 for(const dir of [...new Set([snapshotDir,outputDir])]){
  if(!fs.existsSync(dir))continue;
  for(const file of fs.readdirSync(dir).filter(f=>/^[A-Z]{2}\.json$/.test(f))){
   const code=file.slice(0,2);if(!SUPPORTED_COUNTRIES.includes(code))continue;
   const raw=read(path.join(dir,file),null);
   if(!raw||raw.country!==code||!Array.isArray(raw.chargers))throw Error('Invalid international snapshot '+file);
   const good=raw.chargers.filter(validPersistedOcm);
   report.rejectedLegacy+=raw.chargers.length-good.length;
   parts.set(code,shard(code,good,raw.updatedAt||now,raw.sourceCommit||null));
  }
 }
 report.restored=[...parts.values()].reduce((n,p)=>n+p.chargers.length,0);
 const reference=countries.length?read(path.join(root,'referencedata.json'),null):null;
 if(countries.length&&(!Array.isArray(reference?.DataProviders)||!Array.isArray(reference?.Countries)))throw Error('OCM referencedata.json missing: licence and country checks required');
 for(const country of report.countriesRequested){
  const dir=path.join(root,country);
  if(!fs.existsSync(dir)){report.countriesMissing.push(country);continue;}
  const files=fs.readdirSync(dir).filter(f=>f.endsWith('.json'));
  if(!files.length){report.countriesMissing.push(country);continue;}
  const stations=[],review={recordsReviewed:0,imported:0,rejected:{}};
  for(const file of files){
   report.recordsReviewed++;review.recordsReviewed++;
   // Abort on corrupt/truncated source instead of publishing partial deletion.
   const point=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));
   const result=parseOcmPoint(point,country,reference,now);
   if(result.station)stations.push(result.station);
   else {report.rejected[result.reason]=(report.rejected[result.reason]||0)+1;review.rejected[result.reason]=(review.rejected[result.reason]||0)+1;}
  }
  const part=shard(country,stations,now,sourceCommit);parts.set(country,part);
  review.imported=part.chargers.length;report.countryReview[country]=review;
  report.imported+=part.chargers.length;report.countriesUpdated.push(country);
 }
 const entries=[...parts.values()].map(entry).sort((a,b)=>a.code.localeCompare(b.code));
 const inheritedCommits=[...new Set(entries.map(e=>e.sourceCommit).filter(Boolean))];
 const manifest={schemaVersion:1,updatedAt:now,geographyValidation:OCM_GEOGRAPHY_SOURCE,sourceCommit:sourceCommit||(inheritedCommits.length===1?inheritedCommits[0]:null),countriesWithoutEligibleStations:entries.filter(e=>e.count===0).map(e=>e.code),sources:[{name:'Open Charge Map',url:report.url,notice:report.notice}],countries:entries,countriesMissing:SUPPORTED_COUNTRIES.filter(code=>!parts.has(code))};
 report.sourceCommit=manifest.sourceCommit;
 report.countriesWithoutEligibleStations=manifest.countriesWithoutEligibleStations;
 report.countriesCovered=entries.filter(e=>e.count>0).map(e=>e.code);
 report.stationsByCountry=Object.fromEntries(entries.map(e=>[e.code,e.count]));
 report.index='international/index.json';
 // Spain remains a small initial download; OCM Spain also lives in its shard.
 catalog.chargers=catalog.chargers.filter(c=>!international(c)&&c.id!=='official-lidl-sevilla-luna');
 catalog.internationalSource=report;
 fs.mkdirSync(outputDir,{recursive:true});
 for(const [code,part]of parts)fs.writeFileSync(path.join(outputDir,code+'.json'),JSON.stringify(part));
 fs.writeFileSync(path.join(outputDir,'index.json'),JSON.stringify(manifest));
 fs.writeFileSync(catalogPath,JSON.stringify(catalog));
 return report;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))console.log('International OCM:',JSON.stringify(importInternational()));
