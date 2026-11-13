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
