import test from 'node:test';
import assert from 'node:assert/strict';
import {createInternationalCatalog} from '../src/international-catalog.mjs';

const countries=[{code:'FR',file:'FR.json',count:1,bbox:[-5,42,9,52]},{code:'RU',file:'RU.json',count:1,bbox:[19,41,180,82]}];
const manifest={schemaVersion:1,countries};
const station=code=>({id:'ocm-global-'+code+'-1',country:code,name:code==='RU'?'Москва':'Paris',lat:code==='RU'?55.75:48.85,lng:code==='RU'?37.62:2.35,price:null,sourceUrl:'https://openchargemap.org/site/poi/details/1',dataProvider:{licenseUrl:'https://creativecommons.org/licenses/by/4.0/'}});
const ok=data=>({ok:true,json:async()=>data});
function deferred(){let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(predicate){const deadline=Date.now()+1000;while(!predicate()){assert.ok(Date.now()<deadline,'expected mock download to start');await tick();}}
async function promptly(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('cancellation did not settle promptly')),500);})]);}finally{clearTimeout(timer);}}

test('explicit favourite countries deduplicate requests, retain provenance and reuse completed cache',async()=>{
 const requests=[];
 const loader=createInternationalCatalog({fetchFn:async url=>{
  requests.push(url);
  if(url.endsWith('index.json'))return ok(manifest);
  assert.ok(url.endsWith('RU.json'),'no unrelated country requested');
  return ok({country:'RU',chargers:[station('RU')]});
 }});
 const first=await loader.loadCountries(['RU','RU']);
 assert.deepEqual(first.countries,['RU']);assert.deepEqual(first.stations,[station('RU')]);assert.deepEqual(first.warnings,[]);
 const second=await loader.loadCountries(['RU']);
 assert.deepEqual(second.stations,first.stations);
 assert.equal(requests.filter(url=>url.endsWith('index.json')).length,1);
 assert.equal(requests.filter(url=>url.endsWith('RU.json')).length,1);
 assert.ok(!requests.some(url=>url.endsWith('FR.json')));
});

test('cancelling a favourite consumer preserves the country download shared with a route',async()=>{
 const gate=deferred(),controller=new AbortController();let countrySignal,countryCalls=0;
 const loader=createInternationalCatalog({fetchFn:async(url,{signal})=>{
  if(url.endsWith('index.json'))return ok(manifest);
  assert.ok(url.endsWith('RU.json'));countryCalls++;countrySignal=signal;return gate.promise;
 }});
 const favourites=loader.loadCountries(['RU'],{signal:controller.signal});
 const route=loader.loadForPoints([[55.75,37.62]]);
 await until(()=>countrySignal);await tick();controller.abort();
 await promptly(assert.rejects(favourites,{name:'AbortError'}));assert.equal(countrySignal.aborted,false);
 gate.resolve(ok({country:'RU',chargers:[station('RU')]}));
 assert.deepEqual((await route).stations,[station('RU')]);
 assert.deepEqual((await loader.loadCountries(['RU'])).countries,['RU']);assert.equal(countryCalls,1);
});

test('abort and global timeout never turn pending favourite countries into successful results',async()=>{
 const alreadyAborted=new AbortController();alreadyAborted.abort();
 const inactive=createInternationalCatalog({fetchFn:()=>assert.fail('a pre-cancelled request must not start fetch')});
 await assert.rejects(inactive.loadCountries(['RU'],{signal:alreadyAborted.signal}),{name:'AbortError'});
 const controller=new AbortController();let networkSignal;
 const loader=createInternationalCatalog({fetchFn:async(url,{signal})=>{
  if(url.endsWith('index.json'))return ok(manifest);networkSignal=signal;return new Promise(()=>{});
 }});
 const pending=loader.loadCountries(['RU'],{signal:controller.signal});await until(()=>networkSignal);controller.abort();
 await promptly(assert.rejects(pending,{name:'AbortError'}));assert.equal(networkSignal.aborted,true);
 let timeoutSignal;
 const timed=createInternationalCatalog({fetchFn:async(url,{signal})=>{
  if(url.endsWith('index.json'))return ok(manifest);timeoutSignal=signal;return new Promise(()=>{});
 }});
 await promptly(assert.rejects(timed.loadCountries(['RU'],{budgetMs:200}),{name:'TimeoutError'}));
 assert.equal(timeoutSignal.aborted,true);
});

test('untrusted country paths and invalid country-code collections are rejected before network access',async()=>{
 const loader=createInternationalCatalog({fetchFn:()=>assert.fail('invalid country input must never reach fetch')});
 for(const codes of [['../RU'],['RU.json'],['RU','https://other.example/FR'],['RUS'],[null],null,'RU'])await assert.rejects(()=>loader.loadCountries(codes));
});

test('missing and empty countries explain absent favourite records without inventing coverage',async()=>{
 const empty={schemaVersion:1,countries:[countries[0],{code:'RU',file:'RU.json',count:0,bbox:null}]},requests=[];
 const loader=createInternationalCatalog({fetchFn:async url=>{
  requests.push(url);if(url.endsWith('index.json'))return ok(empty);
  assert.ok(url.endsWith('RU.json'),'no unrelated country requested');return ok({country:'RU',chargers:[]});
 }});
 const result=await loader.loadCountries(['ZZ','RU']);
 assert.deepEqual(result.stations,[]);
 assert.ok(result.warnings.some(message=>message.includes('ZZ')));
 assert.ok(result.warnings.some(message=>message.includes('RU')));
 assert.ok(!requests.some(url=>url.endsWith('ZZ.json')||url.endsWith('FR.json')));
});

test('explicit country loads reject malformed, mismatched and unattributed favourite records',async()=>{
 const variants=[
  {country:'FR',chargers:[station('RU')]},
  {country:'RU',chargers:[]},
  {country:'RU',chargers:[station('FR')]},
  {country:'RU',chargers:[{...station('RU'),lat:91}]},
  {country:'RU',chargers:[{...station('RU'),dataProvider:null}]},
 ];
 for(const payload of variants){
  const loader=createInternationalCatalog({fetchFn:async url=>ok(url.endsWith('index.json')?manifest:payload)});
  const result=await loader.loadCountries(['RU']);
  assert.deepEqual(result.stations,[]);assert.deepEqual(result.countries,[]);
  assert.ok(result.warnings.some(message=>message.includes('RU')));
 }
});
