import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {catalogCoverageCells} from './lib/catalog-coverage.mjs';

export function indexCatalogCoverage(directory='data/international') {
 const file=path.join(directory,'index.json');
 const manifest=JSON.parse(fs.readFileSync(file,'utf8'));
 if(manifest.schemaVersion!==1||!Array.isArray(manifest.countries))throw Error('Invalid country index');
 let cells=0,stations=0;
 for(const entry of manifest.countries){
  if(!/^[A-Z]{2}$/.test(entry.code)||entry.file!==entry.code+'.json')throw Error('Invalid country filename');
  const part=JSON.parse(fs.readFileSync(path.join(directory,entry.file),'utf8'));
  if(part.country!==entry.code||!Array.isArray(part.chargers)||part.chargers.length!==entry.count)throw Error('Country index differs from licensed snapshot');
  entry.coverageCells=catalogCoverageCells(part.chargers);cells+=entry.coverageCells.length;stations+=part.chargers.length;
 }
 manifest.coverageCellDegrees=1;
 fs.writeFileSync(file,JSON.stringify(manifest));
 return {countries:manifest.countries.length,stations,cells};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))console.log('Spatial catalogue index:',JSON.stringify(indexCatalogCoverage(process.argv[2])));
