import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseOcmPoint,providerLicense,validPersistedOcm,withinCountryBounds} from '../scripts/lib/ocm.mjs';
import {importInternational,SUPPORTED_COUNTRIES} from '../scripts/import-international.mjs';
import {parseReveLocation} from '../scripts/lib/reve.mjs';
import {importReve} from '../scripts/import-reve.mjs';
const provider={ID:1,Title:'Open Charge Map Contributors',WebsiteURL:'https://openchargemap.org',IsOpenDataLicensed:true,IsApprovedImport:true,DataProviderStatusType:{IsProviderEnabled:true},License:'Licensed under Creative Commons Attribution 4.0 International (CC BY 4.0)'};
const reference={DataProviders:[provider],Countries:[{ID:80,ISOCode:'FR'},{ID:1,ISOCode:'RU'}],SubmissionStatusTypes:[{ID:100,IsLive:true},{ID:200,IsLive:true},{ID:1,IsLive:false}],UsageTypes:[{ID:1,Title:'Public'},{ID:4,Title:'Membership required'}],Operators:[]};
const point=(overrides={})=>({ID:123,SubmissionStatusTypeID:100,StatusTypeID:50,DataProviderID:1,AddressInfo:{Latitude:48.85,Longitude:2.35,CountryID:80,Title:'Fixture'},Connections:[{ID:11,ConnectionTypeID:1036,PowerKW:22,CurrentTypeID:20},{ID:12,ConnectionTypeID:33,PowerKW:150,CurrentTypeID:30}],UsageTypeID:1,UsageCost:'Free',...overrides});
const location=(id='location')=>({id,country:'ESP',cpo_name:'Operator Legal Name',owner:'Owner - https://owner.invalid',coordinates:{latitude:'40.4',longitude:'-3.7'},evses:[{id:'sgv',evse_id:'ES*ABC*E1',connectors:[{id:'connector',standard:'IEC_62196_T2_COMBO',max_electric_power:350000,power_type:'DC'}]}],last_updated:'2026-11-01T00:00:00Z'});
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cg-import-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function files(t){const dir=temp(t);const catalogPath=path.join(dir,'catalog.json'),cachePath=path.join(dir,'cache.json');fs.writeFileSync(catalogPath,JSON.stringify({chargers:[{id:'national',price:null}]}));return {dir,catalogPath,cachePath};}

test('OCM requires reviewed open provider licence and retains attribution',()=>{
 assert.equal(providerLicense({...provider,License:'Public data redistributed by agreement'}),null);
 assert.equal(providerLicense({...provider,License:'CC BY-NC-SA 3.0'}),null);
 assert.equal(providerLicense({...provider,IsOpenDataLicensed:false}),null);
 assert.equal(providerLicense({...provider,IsApprovedImport:false}),null);
 const station=parseOcmPoint(point(),'FR',reference).station;
 assert.equal(station.dataProvider.name,provider.Title);
 assert.equal(station.dataProvider.licenseUrl,'https://creativecommons.org/licenses/by/4.0/');
 assert.match(station.sourceUrl,/123$/);
 assert(validPersistedOcm(station));
 assert.equal(validPersistedOcm({...station,dataProvider:{...station.dataProvider,license:'CC BY-NC-SA 3.0'}}),false);
 assert.equal(validPersistedOcm({...station,dataProvider:{...station.dataProvider,licenseUrl:'https://arbitrary.invalid/license'}}),false);
 assert.equal(validPersistedOcm({...station,dataProvider:{...station.dataProvider,approvedImport:false}}),false);
});

test('OCM Type 2 cable is AC, CCS1/GB-T stay distinct and station maximum has no ceiling',()=>{
 const station=parseOcmPoint(point({Connections:[...point().Connections,{ConnectionTypeID:32,PowerKW:2000},{ConnectionTypeID:1040,PowerKW:120}]}),'FR',reference).station;
 assert.deepEqual(station.connectors.map(c=>c.type),['Tipo2','CCS','CCS1','GB/T DC']);
 assert.equal(station.connectors[0].powerKw,22);
 assert.equal(station.power,2000);
 assert.equal(station.price,null);
 assert.equal(station.declaredUsageCost,'Free');
 assert(station.connectors.every(c=>c.price===null));
 assert.equal(station.availability,'No verificada en tiempo real');
 const unknown=parseOcmPoint(point({StatusTypeID:undefined}),'FR',reference).station;
 assert.equal(unknown.operationalStatus,null);
 assert.equal(unknown.availability,'No verificada en tiempo real');
});

test('OCM excludes delisted, under-review, unavailable and mismatched-country records',()=>{
 for(const overrides of [{SubmissionStatusTypeID:1},{StatusTypeID:100},{StatusTypeID:150},{StatusTypeID:200},{StatusTypeID:30},{AddressInfo:{...point().AddressInfo,CountryID:1}},{AddressInfo:{...point().AddressInfo,Latitude:null}},{Connections:[{ConnectionTypeID:33,PowerKW:null}]}])assert.equal(parseOcmPoint(point(overrides),'FR',reference).station,undefined);
});

test('international import restores on every build; country refresh replaces stale records atomically',t=>{
 const {dir,catalogPath}=files(t),previousPath=path.join(dir,'previous.json'),root=path.join(dir,'ocm'),snapshotDir=path.join(dir,'snapshot');
 const original=parseOcmPoint(point(),'FR',reference).station;
 fs.writeFileSync(previousPath,JSON.stringify({chargers:[original,{id:'ocm-global-RU-77',price:0}]}));
 let report=importInternational({catalogPath,previousPath,root,snapshotDir,countries:[]});
 assert.equal(report.restored,1);assert.equal(report.rejectedLegacy,1);
 assert.equal(JSON.parse(fs.readFileSync(catalogPath)).chargers.length,1);
 const outputDir=path.join(dir,'international');
 assert.equal(JSON.parse(fs.readFileSync(path.join(outputDir,'FR.json'))).chargers[0].id,original.id);
 fs.mkdirSync(path.join(root,'FR'),{recursive:true});fs.writeFileSync(path.join(root,'referencedata.json'),JSON.stringify(reference));
 fs.writeFileSync(path.join(root,'FR','point.json'),JSON.stringify(point({ID:456})));
 report=importInternational({catalogPath,previousPath,root,snapshotDir,countries:['FR','RU']});
 assert.deepEqual(report.countriesUpdated,['FR']);assert.deepEqual(report.countriesMissing,['RU']);
 const ids=JSON.parse(fs.readFileSync(catalogPath)).chargers.map(c=>c.id);
 assert.deepEqual(ids,['national']);
 const manifest=JSON.parse(fs.readFileSync(path.join(outputDir,'index.json')));
 assert.deepEqual(manifest.countries[0].bbox,[2.35,48.85,2.35,48.85]);
 assert.equal(manifest.countries[0].code,'FR');
 assert.equal(manifest.countries[0].file,'FR.json');
 assert(manifest.countriesMissing.includes('RU'));
 assert.equal(JSON.parse(fs.readFileSync(path.join(outputDir,'FR.json'))).chargers[0].id,'ocm-global-FR-456');
 const before=fs.readFileSync(catalogPath,'utf8');fs.writeFileSync(path.join(root,'FR','point.json'),'{');
 assert.throws(()=>importInternational({catalogPath,previousPath,root,snapshotDir,countries:['FR']}));
 assert.equal(fs.readFileSync(catalogPath,'utf8'),before);
 assert(SUPPORTED_COUNTRIES.includes('RU')&&SUPPORTED_COUNTRIES.includes('JP')&&SUPPORTED_COUNTRIES.includes('CN')&&SUPPORTED_COUNTRIES.includes('GB'));
});

test('REVE contract normalizes Watts per explicit connector, operator and EVSE identifiers',()=>{
 const row=location();row.evses[0].connectors.push({id:'ac',standard:'IEC_62196_T2',max_electric_power:22000,power_type:'AC_3_PHASE'});
 const station=parseReveLocation(row);
 assert.equal(station.operator,'Operator Legal Name');
 assert.equal(station.connectors[0].powerKw,350);assert.equal(station.connectors[0].officialConnectorId,'connector');
 assert.equal(station.connectors[0].officialEvseId,'ES*ABC*E1');
 assert.equal(station.connectors[1].type,'Tipo2');
 assert.equal(station.price,null);assert.equal(station.availability,'Desconocida');
 row.evses[0].connectors=[{standard:'IEC_62196_T2_COMBO',max_voltage:1000,max_amperage:500}];
 assert.equal(parseReveLocation(row),null); // never manufacture a missing socket rating
 assert.equal(parseReveLocation({...location(),coordinates:{latitude:null,longitude:null}}),null);
});

test('REVE restores cache without secret and while hourly budget is reserved',async t=>{
 const opts=files(t),now=Date.parse('2026-11-13T00:00:00Z'),station=parseReveLocation(location());
 fs.writeFileSync(opts.cachePath,JSON.stringify({lastAttempt:now,locations:{[station.id]:{...station,privateHeader:'never publish'}}}));
 let called=0;const fetcher=()=>{called++;throw Error('not expected');};
 const first=await importReve({...opts,key:'fixture-secret',actions:true,now:now+1000,fetcher,log:()=>{}});
 assert.equal(first.status,'rate_budget_wait');assert.equal(first.records,1);
 const second=await importReve({...opts,key:undefined,now:now+2000,fetcher,log:()=>{}});
 assert.equal(second.status,'not_configured');assert.equal(called,0);
 assert.equal(JSON.parse(fs.readFileSync(opts.catalogPath)).chargers.length,2);
 assert(!fs.readFileSync(opts.cachePath,'utf8').includes('privateHeader'));
});

test('durable external REVE reservation disables requests while restoring cached inventory',async t=>{
 const opts=files(t),station=parseReveLocation(location());
 fs.writeFileSync(opts.cachePath,JSON.stringify({lastAttempt:0,locations:{[station.id]:station}}));
 let requested=false;
 const report=await importReve({...opts,key:'fixture-secret',actions:true,skipNetwork:true,fetcher:async()=>{requested=true;throw Error('not authorized');},log:()=>{}});
 assert.equal(requested,false);assert.equal(report.status,'rate_budget_wait');assert.equal(report.requests,0);
 assert.equal(JSON.parse(fs.readFileSync(opts.catalogPath)).chargers.length,2);
});

test('REVE enforces Actions-only secret usage and never persists credentials',async t=>{
 const opts=files(t);await assert.rejects(importReve({...opts,key:'fixture-secret',actions:false,log:()=>{}}),/GitHub Actions/);
 const calls=[];
 const report=await importReve({...opts,key:'fixture-secret',actions:true,fetcher:async(url,options)=>{calls.push({url:String(url),options});return new Response(JSON.stringify([location()]));},log:()=>{}});
 assert.equal(report.status,'synced');assert.equal(calls.length,1);
 assert.equal(calls[0].options.headers['x-api-key'],'fixture-secret');
 assert.equal(new URL(calls[0].url).searchParams.get('only_dynamic_info'),'false');
 assert(!calls[0].url.includes('fixture-secret'));
 assert(!fs.readFileSync(opts.catalogPath,'utf8').includes('fixture-secret'));
 assert(!fs.readFileSync(opts.cachePath,'utf8').includes('fixture-secret'));
});

test('REVE consumes at most four requests, advances pages, and honors HTTP 429',async t=>{
 const opts=files(t),now=Date.parse('2026-11-13T00:00:00Z');let calls=0;
 const report=await importReve({...opts,key:'fixture-secret',actions:true,now,fetcher:async(url)=>{calls++;assert.equal(new URL(url).searchParams.get('page'),String(calls));return new Response(JSON.stringify(Array.from({length:100},(_,i)=>location(calls+'-'+i))));},log:()=>{}});
 assert.equal(calls,4);assert.equal(report.requests,4);assert.equal(report.records,400);
 let limited=0;
 const rate=await importReve({...opts,key:'fixture-secret',actions:true,now:now+3600001,fetcher:async()=>{limited++;return new Response('',{status:429,headers:{'Retry-After':'7200'}});},log:()=>{}});
 assert.equal(rate.status,'rate_limited');assert.equal(limited,1);
 await importReve({...opts,key:'fixture-secret',actions:true,now:now+7200002,fetcher:async()=>{limited++;throw Error('must not fetch');},log:()=>{}});
 assert.equal(limited,1);
});

test('REVE reconciles absent IDs only after a complete cycle spanning two runners',async t=>{
 const opts=files(t),now=Date.parse('2026-11-13T00:00:00Z');
 const removed=parseReveLocation(location('removed')),late=parseReveLocation(location('later-page'));
 fs.writeFileSync(opts.cachePath,JSON.stringify({locations:{[removed.id]:removed,[late.id]:late}}));
 let page=0;
 const partial=await importReve({...opts,key:'fixture-secret',actions:true,now,fetcher:async()=>{
  page++;return new Response(JSON.stringify(Array.from({length:100},(_,i)=>location('page'+page+'-'+i))));
 },log:()=>{}});
 assert.equal(partial.requests,4);assert.equal(partial.reconciled,false);assert.equal(partial.cycleInProgress,true);
 let cache=JSON.parse(fs.readFileSync(opts.cachePath));
 assert.equal(cache.cursor,5);assert.equal(cache.cycle.expectedPage,5);assert.equal(cache.cycle.seenIds.length,400);
 assert(cache.locations[removed.id]&&cache.locations[late.id]);
 const complete=await importReve({...opts,key:'fixture-secret',actions:true,now:now+3600000,fetcher:async url=>{
  assert.equal(new URL(url).searchParams.get('page'),'5');return new Response(JSON.stringify([location('later-page')]));
 },log:()=>{}});
 assert.equal(complete.reconciled,true);assert.equal(complete.removed,1);assert.equal(complete.records,401);
 cache=JSON.parse(fs.readFileSync(opts.cachePath));
 assert(!cache.locations[removed.id]);assert(cache.locations[late.id]);assert.equal(cache.cursor,1);assert.equal(cache.cycle,null);
 assert.equal(cache.lastCompletedCycle,new Date(now+3600000).toISOString());
});

test('a failed REVE page retains unseen old records and resumes that page on the next runner',async t=>{
 const opts=files(t),now=Date.parse('2026-11-13T00:00:00Z'),old=parseReveLocation(location('old'));
 fs.writeFileSync(opts.cachePath,JSON.stringify({locations:{[old.id]:old}}));
 const requested=[];
 const partial=await importReve({...opts,key:'fixture-secret',actions:true,now,fetcher:async url=>{
  const page=Number(new URL(url).searchParams.get('page'));requested.push(page);
  return page===1?new Response(JSON.stringify(Array.from({length:100},(_,i)=>location('first-'+i)))):new Response('',{status:500});
 },log:()=>{}});
 assert.deepEqual(requested,[1,2]);assert.equal(partial.status,'partial');assert.equal(partial.reconciled,false);
 let cache=JSON.parse(fs.readFileSync(opts.cachePath));assert(cache.locations[old.id]);assert.equal(cache.cursor,2);assert.equal(cache.cycle.seenIds.length,100);
 const complete=await importReve({...opts,key:'fixture-secret',actions:true,now:now+3600000,fetcher:async url=>{
  assert.equal(new URL(url).searchParams.get('page'),'2');return new Response(JSON.stringify([location('last')]));
 },log:()=>{}});
 assert.equal(complete.reconciled,true);assert.equal(complete.records,101);
 cache=JSON.parse(fs.readFileSync(opts.cachePath));assert(!cache.locations[old.id]);
});

test('REVE total-pages completes a full final page; a legacy partial cursor never prunes',async t=>{
 const opts=files(t),now=Date.parse('2026-11-13T00:00:00Z'),old=parseReveLocation(location('old'));
 fs.writeFileSync(opts.cachePath,JSON.stringify({cursor:3,totalPages:3,locations:{[old.id]:old}}));
 const legacy=await importReve({...opts,key:'fixture-secret',actions:true,now,fetcher:async url=>{
  assert.equal(new URL(url).searchParams.get('page'),'3');return new Response('[]',{headers:{'total-pages':'3'}});
 },log:()=>{}});
 assert.equal(legacy.reconciled,false);assert.equal(legacy.records,1);assert.equal(JSON.parse(fs.readFileSync(opts.cachePath)).cursor,1);
 let calls=0;
 const full=await importReve({...opts,key:'fixture-secret',actions:true,now:now+3600000,fetcher:async()=>{
  calls++;return new Response(JSON.stringify(Array.from({length:100},(_,i)=>location('cycle-'+calls+'-'+i))),{headers:{'total-pages':'2'}});
 },log:()=>{}});
 assert.equal(calls,2);assert.equal(full.reconciled,true);assert.equal(full.records,200);assert.equal(full.removed,1);
});


test('country geometry rejects gross mislabeled coordinates while retaining islands and antimeridian components',()=>{
 assert.equal(withinCountryBounds('AF',54.13,10.62),false);
 assert.equal(withinCountryBounds('AF',34.5553,69.2075),true);
 assert.equal(withinCountryBounds('FR',48.8566,2.3522),true);
 assert.equal(withinCountryBounds('ES',28.4636,-16.2518),true); // Tenerife
 assert.equal(withinCountryBounds('ES',35.8894,-5.3213),true); // Ceuta
 assert.equal(withinCountryBounds('RU',65,179.5),true);
 assert.equal(withinCountryBounds('RU',65,-179.5),true);
 const afReference={...reference,Countries:[...reference.Countries,{ID:7,ISOCode:'AF'}]};
 const wrong=point({AddressInfo:{...point().AddressInfo,CountryID:7,Latitude:54.13,Longitude:10.62}});
 assert.equal(parseOcmPoint(wrong,'AF',afReference).reason,'country_coordinates_outside_bounds');
 const correct=point({AddressInfo:{...point().AddressInfo,CountryID:7,Latitude:34.5553,Longitude:69.2075}});
 const station=parseOcmPoint(correct,'AF',afReference).station;
 assert(station);assert(validPersistedOcm(station));
 assert.equal(validPersistedOcm({...station,lat:54.13,lng:10.62}),false);
 assert.equal(validPersistedOcm({...station,country:'FR'}),false);
});


test('a short REVE page that contradicts declared remaining pages cannot prove absence',async t=>{
 const opts=files(t),old=parseReveLocation(location('old'));
 fs.writeFileSync(opts.cachePath,JSON.stringify({locations:{[old.id]:old}}));
 const result=await importReve({...opts,key:'fixture-secret',actions:true,fetcher:async()=>new Response(JSON.stringify([location('new')]),{headers:{'total-pages':'3'}}),log:()=>{}});
 assert.equal(result.reconciled,false);assert.equal(result.status,'sync_failed');
 const cache=JSON.parse(fs.readFileSync(opts.cachePath));assert(cache.locations[old.id]);assert.equal(cache.cursor,1);
});
