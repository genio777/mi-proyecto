// Authenticated REVE inventory is fetched only by GitHub Actions. The workflow
// supplies REVE_API_KEY from secrets, never VITE_*, HTML, query strings or files.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseReveLocation,sanitizeReveCache} from './lib/reve.mjs';
const read=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}};
export async function importReve({catalogPath='public/data/chargers-spain.json',cachePath='public/data/reve-cache.json',key=process.env.REVE_API_KEY,actions=process.env.GITHUB_ACTIONS==='true',skipNetwork=process.env.REVE_SKIP_NETWORK==='true',fetcher=fetch,now=Date.now(),log=console.log}={}) {
 const catalog=read(catalogPath,null);
 if(!Array.isArray(catalog?.chargers))throw Error('DGT catalog missing');
 const cache=sanitizeReveCache(read(cachePath,{}));
 const hour=3600000,importedAt=new Date(now).toISOString();
 let status='cached',requests=0,reconciled=false,removed=0;
 if(!key){status='not_configured';log('REVE: Actions secret REVE_API_KEY is absent; restoring cached inventory only');}
 else if(!actions)throw Error('REVE sync requires GitHub Actions and repository secret REVE_API_KEY');
 else if(skipNetwork||now-cache.lastAttempt<hour||cache.retryAfter>now){status='rate_budget_wait';log('REVE: request budget reserved; restoring cached inventory');}
 else {
  // Reserve the whole four-request budget before any request. A crash/error
  // cannot cause the next ten-minute publication to retry the same hour.
  cache.lastAttempt=now;
  // Only a cycle known to have started at page 1 can prove an absence. An old
  // cursor without cycle state is resumed safely but never used to prune.
  const beginCycle=()=>{cache.cursor=1;cache.totalPages=0;cache.cycle={version:1,startedAt:importedAt,expectedPage:1,seenIds:[]};};
  if(cache.cursor===1||cache.totalPages&&cache.cursor>cache.totalPages)beginCycle();
  const persist=()=>{const json=JSON.stringify(cache);if(key&&json.includes(key))throw Error('REVE secret detected in public cache');fs.mkdirSync(path.dirname(cachePath),{recursive:true});fs.writeFileSync(cachePath,json);};
  persist();
  status='sync_failed';
  try {
   for(let i=0;i<4;i++){
    const url=new URL('https://www.mapareve.es/api/external/v1/locations');
    url.searchParams.set('page',String(cache.cursor));url.searchParams.set('limit','100');url.searchParams.set('only_dynamic_info','false');
    requests++;
    const response=await fetcher(url,{headers:{'x-api-key':key,Accept:'application/json'},signal:AbortSignal.timeout(45000)});
    if(response.status===429){
     const retry=response.headers.get('retry-after'),seconds=Number(retry);
     cache.retryAfter=Math.max(now+hour,Number.isFinite(seconds)&&seconds>0?now+seconds*1000:Date.parse(retry)||0);
     status='rate_limited';log('REVE: HTTP 429; retry deferred');break;
    }
    if(!response.ok){status=cache.lastSuccess===importedAt?'partial':'sync_failed';log('REVE: HTTP '+response.status+'; cached inventory retained');break;}
    const rows=await response.json();
    if(!Array.isArray(rows))throw Error('Unexpected REVE locations schema');
    let accepted=0;
    const seen=new Set(cache.cycle?.seenIds||[]);
    for(const row of rows){
     const station=parseReveLocation(row,importedAt);
     if(station){cache.locations[station.id]=station;seen.add(station.id);accepted++;}
     else if(typeof row?.id==='string')delete cache.locations['reve:'+row.id.trim().slice(0,500)];
    }
    if(cache.cycle)cache.cycle.seenIds=[...seen];
    const pages=Number(response.headers.get('total-pages'));
    if(Number.isSafeInteger(pages)&&pages>0)cache.totalPages=pages;
    if(cache.totalPages&&cache.cursor<cache.totalPages&&rows.length<100)throw Error('REVE pagination is incomplete');
    log('REVE page '+cache.cursor+': '+rows.length+' locations, '+accepted+' explicit connector ratings');
    cache.cursor++;cache.lastSuccess=importedAt;cache.retryAfter=0;status='synced';
    if(cache.cycle)cache.cycle.expectedPage=cache.cursor;
    // A short final page (including an empty sentinel page) or a declared
    // total proves completion. Partial runs and failed pages never remove IDs
    // merely because they have not yet been seen.
    if(rows.length<100||cache.totalPages&&cache.cursor>cache.totalPages){
     if(cache.cycle){
      for(const id of Object.keys(cache.locations))if(!seen.has(id)){delete cache.locations[id];removed++;}
      cache.lastCompletedCycle=importedAt;reconciled=true;
     }
     cache.cursor=1;cache.totalPages=0;cache.cycle=null;break;
    }
    persist();
   }
  }catch{status=cache.lastSuccess===importedAt?'partial':'sync_failed';log('REVE: network or schema error; cached inventory retained');}
  persist();
 }
 const cacheJson=JSON.stringify(cache);if(key&&cacheJson.includes(key))throw Error('REVE secret detected in public cache');
 fs.mkdirSync(path.dirname(cachePath),{recursive:true});fs.writeFileSync(cachePath,cacheJson);
 const byId=new Map(catalog.chargers.filter(c=>!String(c.id).startsWith('reve:')).map(c=>[String(c.id),c]));
 for(const station of Object.values(cache.locations))byId.set(station.id,station);
 catalog.chargers=[...byId.values()];
 catalog.reveApi={source:'Red Eléctrica de España · mapa REVE',sourceUrl:'https://www.mapareve.es/',licenseUrl:'https://www.ree.es/es/aviso-legal',status,lastSuccess:cache.lastSuccess,lastCompletedCycle:cache.lastCompletedCycle,reconciled,removed,cycleInProgress:!!cache.cycle,records:Object.keys(cache.locations).length,requests,notice:'Inventario estático declarado por operadores. No acredita plazas libres ni precio; uso sujeto a condiciones REVE.'};
 const json=JSON.stringify(catalog);if(key&&json.includes(key))throw Error('REVE secret detected in public catalog');
 fs.writeFileSync(catalogPath,json);
 return catalog.reveApi;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))console.log('REVE:',JSON.stringify(await importReve()));
