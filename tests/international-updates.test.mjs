import test from 'node:test';
import assert from 'node:assert/strict';
import * as catalogue from '../src/international-catalog.mjs';

const entry=(code='FR',count=1,updatedAt='2026-11-16T08:00:00Z')=>({code,file:code+'.json',count,bbox:[1,47,3,49],updatedAt});
const manifest=(count=1,updatedAt)=>({schemaVersion:1,countries:[entry('FR',count,updatedAt)]});
const station=(id='first',country='FR')=>({id:'fixture-'+id,country,lat:48,lng:2,price:null,sourceUrl:'https://openchargemap.org/site/poi/details/1',dataProvider:{licenseUrl:'https://creativecommons.org/licenses/by/4.0/'}});
const part=(count=1)=>({country:'FR',chargers:Array.from({length:count},(_,i)=>station('station-'+i))});
function deferred(){let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(predicate){const deadline=Date.now()+1000;while(!predicate()){assert.ok(Date.now()<deadline,'mock reader started');await tick();}}

test('snapshot validation runs before a reader commits and a malformed refresh preserves its last good country',async()=>{
 const persisted=new Map(),good=part();let malformed=false,guardCalls=0;
 const loader=catalogue.createInternationalCatalog({fetchFn:()=>assert.fail('an injected JSON source must replace fetch'),readJson:async(file,{signal,validate})=>{
  assert.equal(signal.aborted,false);
  const incoming=file==='index.json'?manifest():malformed?{country:'FR',chargers:[]}:good;
  try{
   assert.strictEqual(validate(incoming),incoming,'the source guard retains raw JSON, not a station array');guardCalls++;
   persisted.set(file,incoming);return incoming;
  }catch(error){
   const saved=persisted.get(file);if(!saved)throw error;validate(saved);return saved;
  }
 }});
 assert.deepEqual((await loader.loadCountries(['FR'])).stations,good.chargers);
 malformed=true;loader.invalidate();
 const refreshed=await loader.loadCountries(['FR']);
 assert.deepEqual(refreshed.stations,good.chargers);
 assert.deepEqual(refreshed.warnings,[]);
 assert.strictEqual(persisted.get('FR.json'),good);
 assert.equal(guardCalls,3,'invalid country was not committed as a fourth successful read');
});

test('a JSON adapter cannot bypass the loader validation for missing provenance',async()=>{
 const loader=catalogue.createInternationalCatalog({readJson:async file=>file==='index.json'?manifest():{country:'FR',chargers:[{...station(),dataProvider:null}]}});
 const result=await loader.loadCountries(['FR']);
 assert.deepEqual(result.stations,[]);assert.deepEqual(result.countries,[]);
 assert.match(result.warnings.join(' '),/sin atribución/);
});

test('completed snapshots expire when configured while the existing infinite web cache remains unchanged',async()=>{
 for(const ttl of [Infinity,1000]){
  let clock=0,calls=0;
  const loader=catalogue.createInternationalCatalog({cacheTtlMs:ttl,now:()=>clock,readJson:async(file,{validate})=>{calls++;return validate(file==='index.json'?manifest():part());}});
  await loader.loadCountries(['FR']);assert.equal(calls,2);
  clock=999;await loader.loadCountries(['FR']);assert.equal(calls,2);
  clock=1000;await loader.loadCountries(['FR']);assert.equal(calls,ttl===Infinity?2:4);
 }
});

test('TTL and invalidation preserve active shared downloads and freshness starts at successful completion',async()=>{
 let clock=0,calls=0;const gate=deferred();
 const loader=catalogue.createInternationalCatalog({cacheTtlMs:1000,now:()=>clock,readJson:async(file,{validate})=>{
  calls++;return validate(file==='index.json'?await gate.promise:part());
 }});
 const first=loader.loadCountries(['FR']);await until(()=>calls===1);
 clock=10000;assert.deepEqual(loader.invalidate(),{manifest:false,countries:0});
 const second=loader.loadCountries(['FR']);await tick();assert.equal(calls,1);
 gate.resolve(manifest());await Promise.all([first,second]);assert.equal(calls,2);
 clock=10999;await loader.loadCountries(['FR']);assert.equal(calls,2);
 clock=11000;await loader.loadCountries(['FR']);assert.equal(calls,4);
});

test('a renewed manifest refreshes an incompatible country even when that country cache is still fresh',async()=>{
 let clock=0,version=1,countryCalls=0;
 const loader=catalogue.createInternationalCatalog({cacheTtlMs:1000,now:()=>clock,readJson:async(file,{validate})=>{
  if(file==='index.json')return validate(manifest(version,'2026-11-16T0'+(7+version)+':00:00Z'));
  countryCalls++;if(version===1)clock=800;return validate(part(version));
 }});
 assert.equal((await loader.loadCountries(['FR'])).stations.length,1);
 version=2;clock=1001;
 assert.equal((await loader.loadCountries(['FR'])).stations.length,2);
 assert.equal(countryCalls,2,'count/metadata changes cannot reuse the younger, incompatible country task');
});

test('new manifest consumers do not cancel an older country snapshot that is already in use',async()=>{
 let version=1,countryCalls=0,oldSignal;const oldGate=deferred();
 const loader=catalogue.createInternationalCatalog({readJson:async(file,{signal,validate})=>{
  if(file==='index.json')return validate(manifest(version,'2026-11-16T0'+(7+version)+':00:00Z'));
  countryCalls++;if(countryCalls===1){oldSignal=signal;return validate(await oldGate.promise);}
  return validate(part(2));
 }});
 const original=loader.loadCountries(['FR']);await until(()=>oldSignal);
 version=2;assert.deepEqual(loader.invalidate(),{manifest:true,countries:0});
 const renewed=await loader.loadCountries(['FR']);
 assert.equal(renewed.stations.length,2);assert.equal(oldSignal.aborted,false);
 oldGate.resolve(part(1));assert.equal((await original).stations.length,1);
 assert.equal((await loader.loadCountries(['FR'])).stations.length,2);
 assert.equal(countryCalls,2);
});

test('injected source requests keep cancellation and the three-download concurrency limit',async()=>{
 const codes=['FR','DE','ES','PT','IT'];let active=0,maximum=0;
 const loader=catalogue.createInternationalCatalog({readJson:async(file,{validate})=>{
  if(file==='index.json')return validate({schemaVersion:1,countries:codes.map(code=>entry(code))});
  active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setTimeout(resolve,10));active--;
  const country=file.slice(0,2);return validate({country,chargers:[station(country,country)]});
 }});
 assert.equal((await loader.loadCountries(codes)).countries.length,5);assert.equal(maximum,3);
 let requestSignal;const controller=new AbortController();
 const pending=catalogue.createInternationalCatalog({readJson:async(_file,{signal})=>{requestSignal=signal;return new Promise(()=>{});}});
 const operation=pending.loadCountries(['FR'],{signal:controller.signal});await until(()=>requestSignal);controller.abort();
 await assert.rejects(operation,{name:'AbortError'});assert.equal(requestSignal.aborted,true);
});

test('the public singleton can be configured once before mounting the native application',async()=>{
 const previous=catalogue.internationalCatalog;
 try{
  const configured=catalogue.configureInternationalCatalog({readJson:async(_file,{validate})=>validate(manifest())});
  assert.notStrictEqual(configured,previous);assert.strictEqual(catalogue.internationalCatalog,configured);
  assert.deepEqual(await catalogue.internationalCatalog.loadManifest(),manifest());
 }finally{catalogue.configureInternationalCatalog();}
});
