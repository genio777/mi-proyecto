import test from 'node:test';
import assert from 'node:assert/strict';
import {createInternationalCatalog,selectCountries,routeBounds} from '../src/international-catalog.mjs';
const countries=[{code:'FR',file:'FR.json',count:1,bbox:[-5,42,9,52]},{code:'RU',file:'RU.json',count:1,bbox:[19,41,180,82]},{code:'JP',file:'JP.json',count:1,bbox:[129,30,146,46]}];
const manifest={schemaVersion:1,countries};
const station=code=>({id:'ocm-'+code,country:code,lat:code==='JP'?35:48,lng:code==='JP'?140:code==='RU'?40:2,sourceUrl:'https://openchargemap.org/site/poi/details/1',dataProvider:{licenseUrl:'https://creativecommons.org/licenses/by/4.0/'}});
const ok=data=>({ok:true,json:async()=>data});

test('route selection follows segment boxes rather than the entire diagonal bounding rectangle',()=>{
 const route=[[48,2],[55,10],[55,40]];
 assert.deepEqual(selectCountries(manifest,route).map(c=>c.code),['FR','RU']);
 assert.deepEqual(selectCountries(manifest,[[35,140]],15).map(c=>c.code),['JP']);
 assert.throws(()=>routeBounds([[100,2]]),/Coordenadas inválidas/);
});
test('dateline crossing keeps boxes near the dateline',()=>{
 const boxes=routeBounds([[50,179],[51,-179]],5);
 assert.ok(boxes.every(b=>b[0]>170||b[2]<-170));
});
test('manifest and country fetches are deduplicated across concurrent map and route requests',async()=>{
 const requests=[];
 const loader=createInternationalCatalog({fetchFn:async url=>{requests.push(url);return ok(url.endsWith('index.json')?manifest:{country:'FR',chargers:[station('FR')]});}});
 const results=await Promise.all([loader.loadForPoints([[48,2]]),loader.loadForPoints([[49,2]])]);
 assert.equal(requests.filter(s=>s.endsWith('index.json')).length,1);
 assert.equal(requests.filter(s=>s.endsWith('FR.json')).length,1);
 assert.deepEqual(results[0].countries,['FR']);assert.equal(results[0].stations.length,1);assert.deepEqual(results[0].warnings,[]);
 assert.ok(!requests.some(s=>s.endsWith('RU.json')||s.endsWith('JP.json')));
});
test('failed shard is a coverage warning, does not discard successful countries and can retry',async()=>{
 let fail=true;
 const loader=createInternationalCatalog({fetchFn:async url=>url.endsWith('index.json')?ok(manifest):url.endsWith('RU.json')&&fail?{ok:false,status:503}:ok({country:url.endsWith('RU.json')?'RU':'FR',chargers:[station(url.endsWith('RU.json')?'RU':'FR')]})});
 const first=await loader.loadForPoints([[48,2],[55,40]]);
 assert.deepEqual(first.countries,['FR']);assert.match(first.warnings[0],/catálogo RU/);assert.equal(first.stations.length,1);
 fail=false;const second=await loader.loadForPoints([[55,40]]);assert.deepEqual(second.countries,['RU']);assert.deepEqual(second.warnings,[]);
});
test('missing manifest and malicious manifest paths are transparent failures',async()=>{
 for(const payload of [null,{schemaVersion:1,countries:[{...countries[0],file:'https://other.example/FR.json'}]}]) {
   const loader=createInternationalCatalog({fetchFn:async()=>ok(payload)});
   const result=await loader.loadForPoints([[48,2]]);assert.equal(result.stations.length,0);assert.match(result.warnings[0],/índice internacional/);
 }
});
test('wrong-country and unlicensed shard records are rejected',async()=>{
 const loader=createInternationalCatalog({fetchFn:async url=>ok(url.endsWith('index.json')?manifest:{country:'FR',chargers:[{...station('RU'),dataProvider:null}]})});
 const result=await loader.loadForPoints([[48,2]]);assert.equal(result.stations.length,0);assert.match(result.warnings[0],/sin atribución/);
});
test('aborted requests never become valid coverage results',async()=>{
 const controller=new AbortController();controller.abort();
 const loader=createInternationalCatalog({fetchFn:()=>assert.fail('no request')});
 await assert.rejects(loader.loadForPoints([[48,2]],{signal:controller.signal}),{name:'AbortError'});
});
test('empty country snapshots have null bbox and do not invalidate the full manifest',async()=>{
 const loader=createInternationalCatalog({fetchFn:async url=>ok(url.endsWith('index.json')?{schemaVersion:1,countries:[{code:'AD',file:'AD.json',count:0,bbox:null},countries[0]]}:{country:'FR',chargers:[station('FR')]})});
 const result=await loader.loadForPoints([[48,2]]);assert.deepEqual(result.countries,['FR']);assert.deepEqual(result.warnings,[]);
});

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(predicate){const deadline=Date.now()+1000;while(!predicate()){assert.ok(Date.now()<deadline,'mock request started within one second');await tick();}}
async function promptly(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('cancellation did not detach promptly')),500);})]);}finally{clearTimeout(timer);}}

test('optional one-degree coverage cells exclude mainland false positives from overseas country bboxes',async()=>{
 const france={...countries[0],bbox:[-4.77,-21.33,55.47,51.42],coverageCells:[[2,48],[55,-22]]};
 const indexed={schemaVersion:1,coverageCellDegrees:1,countries:[france]};
 assert.deepEqual(selectCountries(indexed,[[40.4168,-3.7038]],50),[]);
 assert.deepEqual(selectCountries(indexed,[[48.85,2.35]],50).map(c=>c.code),['FR']);
 assert.deepEqual(selectCountries(indexed,[[-21.2,55.4]],15).map(c=>c.code),['FR']);
 const requests=[];
 const loader=createInternationalCatalog({fetchFn:async url=>{requests.push(url);return ok(indexed);}});
 const result=await loader.loadForPoints([[40.4168,-3.7038]]);
 assert.equal(requests.length,1);assert.deepEqual(result.countries,[]);assert.deepEqual(result.stations,[]);
});
test('coverage selection includes radius margins, negative cells and dateline edges',()=>{
 const data={schemaVersion:1,coverageCellDegrees:1,countries:[
   {code:'FR',count:1,bbox:[2,48,2.9,48.9],coverageCells:[[2,48]]},
   {code:'ES',count:1,bbox:[-4,40,-3.1,40.9],coverageCells:[[-4,40]]},
   {code:'RU',count:1,bbox:[179,50,180,51],coverageCells:[[179,50],[180,50]]}
 ]};
 assert.deepEqual(selectCountries(data,[[47.7,2.35]],50).map(c=>c.code),['FR']);
 assert.deepEqual(selectCountries(data,[[40.4,-3.7]],0).map(c=>c.code),['ES']);
 assert.deepEqual(selectCountries(data,[[50,179.9],[50,-179.9]],50).map(c=>c.code),['RU']);
});
test('malformed coverage cells never silently claim a country has no coverage',async()=>{
 const variants=[{coverageCells:[[2,48]]},{coverageCellDegrees:2,coverageCells:[[2,48]]},{coverageCellDegrees:1,coverageCells:[]},{coverageCellDegrees:1,coverageCells:[[2.5,48]]},{coverageCellDegrees:1,coverageCells:[[181,48]]}];
 for(const metadata of variants){
  const loader=createInternationalCatalog({fetchFn:async()=>ok({schemaVersion:1,countries:[{...countries[0],...metadata}]})});
  const result=await loader.loadForPoints([[48,2]]);assert.match(result.warnings[0],/índice internacional/);assert.deepEqual(result.countries,[]);
 }
});
test('old indexes without cells keep the conservative country bbox fallback',()=>{
 const older={schemaVersion:1,countries:[{...countries[0],bbox:[-4.77,-21.33,55.47,51.42]}]};
 assert.deepEqual(selectCountries(older,[[40.4168,-3.7038]],50).map(c=>c.code),['FR']);
});

test('abort while the manifest is pending detaches immediately and aborts the last network consumer',async()=>{
 const gate=deferred(),controller=new AbortController();let networkSignal,calls=0;
 const loader=createInternationalCatalog({fetchFn:async(url,{signal})=>{calls++;networkSignal=signal;return gate.promise;}});
 const result=loader.loadForPoints([[48,2]],{signal:controller.signal});
 await until(()=>networkSignal);const reason=new DOMException('Cancelado por el usuario','AbortError');controller.abort(reason);
 await promptly(assert.rejects(result,error=>error===reason));assert.equal(networkSignal.aborted,true);assert.equal(calls,1);
 gate.resolve(ok(manifest));await tick();assert.equal(calls,1);
});
test('cancelling one manifest consumer does not abort or poison a second consumer',async()=>{
 const gate=deferred(),firstController=new AbortController();let networkSignal,manifestCalls=0;
 const loader=createInternationalCatalog({fetchFn:async(url,{signal})=>url.endsWith('index.json')?(manifestCalls++,networkSignal=signal,gate.promise):ok({country:'FR',chargers:[station('FR')]})});
 const first=loader.loadForPoints([[48,2]],{signal:firstController.signal});
 const second=loader.loadForPoints([[48,2]]);
 await until(()=>networkSignal);firstController.abort();await promptly(assert.rejects(first,{name:'AbortError'}));assert.equal(networkSignal.aborted,false);
 gate.resolve(ok(manifest));assert.deepEqual((await second).countries,['FR']);assert.equal(manifestCalls,1);
});
test('a shared shard survives a cancelled route while another caller and the successful cache remain valid',async()=>{
 const gate=deferred(),controller=new AbortController();let countrySignal,countryCalls=0;
 const loader=createInternationalCatalog({fetchFn:async(url,{signal})=>url.endsWith('index.json')?ok(manifest):(countryCalls++,countrySignal=signal,gate.promise)});
 const first=loader.loadForPoints([[48,2]],{signal:controller.signal}),second=loader.loadForPoints([[48,2]]);
 await until(()=>countrySignal);await tick();controller.abort();await promptly(assert.rejects(first,{name:'AbortError'}));assert.equal(countrySignal.aborted,false);
 gate.resolve(ok({country:'FR',chargers:[station('FR')]}));assert.deepEqual((await second).countries,['FR']);
 assert.deepEqual((await loader.loadForPoints([[48,2]])).countries,['FR']);assert.equal(countryCalls,1);
});
test('a cancelled last shard consumer evicts before retry and a late old failure cannot erase new cache',async()=>{
 const old=deferred(),controller=new AbortController();let calls=0,oldSignal;
 const loader=createInternationalCatalog({fetchFn:async(url,{signal})=>{
  if(url.endsWith('index.json'))return ok(manifest);
  calls++;if(calls===1){oldSignal=signal;return old.promise;}
  return ok({country:'FR',chargers:[station('FR')]});
 }});
 const first=loader.loadForPoints([[48,2]],{signal:controller.signal});await until(()=>oldSignal);controller.abort();await promptly(assert.rejects(first,{name:'AbortError'}));assert.equal(oldSignal.aborted,true);
 assert.deepEqual((await loader.loadForPoints([[48,2]])).countries,['FR']);
 old.reject(Error('late response from cancelled download'));await tick();
 assert.deepEqual((await loader.loadForPoints([[48,2]])).countries,['FR']);assert.equal(calls,2);
});
test('cancellation during response.json detaches, aborts the body and never publishes the late result',async()=>{
 const body=deferred(),controller=new AbortController();let bodyStarted=false,bodySignal,calls=0;
 const loader=createInternationalCatalog({fetchFn:async(url,{signal})=>{
  if(url.endsWith('index.json'))return ok(manifest);
  if(++calls===1){bodySignal=signal;return {ok:true,json:()=>{bodyStarted=true;return body.promise;}};}
  return ok({country:'FR',chargers:[station('FR')]});
 }});
 const first=loader.loadForPoints([[48,2]],{signal:controller.signal});await until(()=>bodyStarted);controller.abort();await promptly(assert.rejects(first,{name:'AbortError'}));assert.equal(bodySignal.aborted,true);
 body.resolve({country:'FR',chargers:[station('FR')]});await tick();
 assert.deepEqual((await loader.loadForPoints([[48,2]])).countries,['FR']);assert.equal(calls,2);
});
test('the global budget bounds sequential countries and prevents starting the next queued country',async()=>{
 const sharedBox=[-5,30,145,60],selected={schemaVersion:1,countries:countries.map(c=>({...c,bbox:sharedBox}))};
 const requests=[];let blockedSignal;
 const loader=createInternationalCatalog({concurrency:1,fetchFn:async(url,{signal})=>{
  requests.push(url);if(url.endsWith('index.json'))return ok(selected);
  if(url.endsWith('FR.json')){await new Promise(resolve=>setTimeout(resolve,20));return ok({country:'FR',chargers:[station('FR')]});}
  blockedSignal=signal;return new Promise(()=>{});
 }});
 await promptly(assert.rejects(loader.loadForPoints([[48,2]],{budgetMs:80}),{name:'TimeoutError'}));
 assert.ok(requests.some(url=>url.endsWith('FR.json')));assert.ok(requests.some(url=>url.endsWith('RU.json')));assert.ok(!requests.some(url=>url.endsWith('JP.json')));assert.equal(blockedSignal.aborted,true);
});
test('a caller aborted in the global fetch queue never starts fetch or prevents a later retry',async()=>{
 const firstController=new AbortController(),queuedController=new AbortController();let blockedSignal,ruCalls=0;
 const loader=createInternationalCatalog({concurrency:1,fetchFn:async(url,{signal})=>{
  if(url.endsWith('index.json'))return ok(manifest);
  if(url.endsWith('FR.json')){blockedSignal=signal;return new Promise(()=>{});}
  ruCalls++;return ok({country:'RU',chargers:[station('RU')]});
 }});
 const first=loader.loadForPoints([[48,2]],{signal:firstController.signal});await until(()=>blockedSignal);
 const queued=loader.loadForPoints([[55,40]],{signal:queuedController.signal});await tick();queuedController.abort();await promptly(assert.rejects(queued,{name:'AbortError'}));assert.equal(ruCalls,0);
 firstController.abort();await promptly(assert.rejects(first,{name:'AbortError'}));
 assert.deepEqual((await loader.loadForPoints([[55,40]])).countries,['RU']);assert.equal(ruCalls,1);
});
test('a network request timeout warns about incomplete coverage and allows manifest retry',async()=>{
 let hanging=true,calls=0;
 const loader=createInternationalCatalog({timeoutMs:20,budgetMs:1000,fetchFn:async url=>{calls++;return hanging?new Promise(()=>{}):ok(url.endsWith('index.json')?manifest:{country:'FR',chargers:[station('FR')]});}});
 const failed=await promptly(loader.loadForPoints([[48,2]]));assert.deepEqual(failed.countries,[]);assert.match(failed.warnings[0],/no está verificada/);
 hanging=false;assert.deepEqual((await loader.loadForPoints([[48,2]])).countries,['FR']);assert.equal(calls,3);
});
test('standalone manifest loads honor a caller signal without waiting for the request timeout',async()=>{
 const controller=new AbortController();let signal;
 const loader=createInternationalCatalog({fetchFn:async(_url,options)=>{signal=options.signal;return new Promise(()=>{});}});
 const pending=loader.loadManifest({signal:controller.signal});await until(()=>signal);controller.abort();await promptly(assert.rejects(pending,{name:'AbortError'}));assert.equal(signal.aborted,true);
});
test('the radius around one dateline point includes nearby cells on the opposite hemisphere',()=>{
 const index={schemaVersion:1,coverageCellDegrees:1,countries:[{code:'RU',count:1,bbox:[-179.9,50,-179.8,50.1],coverageCells:[[-180,50]]}]};
 assert.deepEqual(selectCountries(index,[[50,179.9]],50).map(c=>c.code),['RU']);
});
test('coverage cells outside a country bbox invalidate the index instead of silently hiding the country',async()=>{
 const invalid={schemaVersion:1,coverageCellDegrees:1,countries:[{...countries[0],coverageCells:[[140,35]]}]};
 const loader=createInternationalCatalog({fetchFn:async()=>ok(invalid)});
 const result=await loader.loadForPoints([[48,2]]);assert.deepEqual(result.countries,[]);assert.match(result.warnings[0],/Celdas de cobertura internacional inválidas/);
});
test('synchronous response work cannot return verified coverage after the global deadline',async()=>{
 const loader=createInternationalCatalog({fetchFn:async()=>({ok:true,json:()=>{
  const until=Date.now()+20;while(Date.now()<until){ /* Simulate synchronous JSON work on a slower device. */ }
  return manifest;
 }})});
 await assert.rejects(loader.loadForPoints([[48,2]],{budgetMs:5}),{name:'TimeoutError'});
});
