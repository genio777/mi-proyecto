import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogUpdates,createCatalogCache,validateCatalogResource,PUBLISHED_CATALOG_BASE,CATALOG_CACHE_MAX_AGE_MS,CATALOG_CACHE_NAME} from '../src/catalog-updates.mjs';

const path='data/chargers-spain.json';
const copy=value=>JSON.parse(JSON.stringify(value));
const station=(id='fixture')=>({id,name:'Fixture '+id,city:'Madrid',lat:40.4,lng:-3.7,power:150,connector:'CCS',connectors:[{type:'CCS',powerKw:150}],price:null,source:'Synthetic unit fixture'});
const national=(id='fixture',updated='2026-11-16T10:00:00Z')=>({updated,chargers:[station(id)]});
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>copy(data)});
function memory(initial=[]){const entries=new Map(initial.map(([key,value])=>[key,copy(value)]));return {entries,async get(key){return entries.has(key)?copy(entries.get(key)):null;},async set(key,value){entries.set(key,copy(value));}};}
const record=(data,savedAt=1000,file=path)=>({version:1,path:file,savedAt,data});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};

test('native first launch reads the bundled snapshot quickly and a separate check downloads only the fixed publication',async()=>{
 const cache=memory(),calls=[],bundled=national('bundled','2026-11-15T10:00:00Z'),published=national('published');
 const client=createCatalogUpdates({native:true,cache,now:()=>1000,fetchFn:async(url,options)=>{calls.push({url,options});return response(url.startsWith('https:')?published:bundled);}});
 const initial=await client.read(path,{network:false});assert.equal(initial.source,'embedded');assert.deepEqual(initial.data,bundled);assert.equal(initial.savedAt,null);
 const updated=await client.read(path);assert.equal(updated.source,'published');assert.deepEqual(updated.data,published);assert.equal(updated.savedAt,1000);
 assert.deepEqual(calls.map(call=>call.url),['./'+path,PUBLISHED_CATALOG_BASE+path]);
 assert.equal(calls[1].options.credentials,'omit');assert.equal(calls[1].options.redirect,'error');
 assert.deepEqual(cache.entries.get(path).data,published);assert.equal(updated.data.chargers[0].price,null);
});

test('a recreated native client keeps the last downloaded catalogue offline without renewing its source or download date',async()=>{
 const data=national(),cache=memory([[path,record(data,1000)]]);let clock=1000+CATALOG_CACHE_MAX_AGE_MS+1,calls=0;
 const client=createCatalogUpdates({native:true,cache,now:()=>clock,fetchFn:async()=>{calls++;throw Error('Offline');}});
 const initial=await client.read(path,{network:false});assert.equal(initial.source,'cached');assert.equal(calls,0);
 const offline=await client.read(path);assert.equal(offline.source,'cached');assert.equal(calls,1);assert.equal(offline.savedAt,1000);assert.equal(offline.checkedAt,clock);assert.equal(offline.data.updated,data.updated);assert.match(offline.warning,/no se ha podido|sin renovar/i);
 assert.deepEqual(cache.entries.get(path),record(data,1000));
});

test('fresh cached data avoids repeated downloads while force checks once and preserves original dates',async()=>{
 let clock=1001,calls=0;const cache=memory([[path,record(national('old'),1000)]]),next=national('new','2026-11-16T11:00:00Z');
 const client=createCatalogUpdates({native:true,cache,now:()=>clock,fetchFn:async()=>{calls++;return response(next);}});
 assert.equal((await client.read(path)).source,'cached');assert.equal(calls,0);
 clock=2000;assert.deepEqual((await client.read(path,{force:true})).data,next);assert.equal(calls,1);
 assert.equal(cache.entries.get(path).savedAt,2000);assert.equal(cache.entries.get(path).data.updated,next.updated);
});

test('web reads stay relative and never open or write native cache',async()=>{
 const calls=[],cache={get(){throw Error('Not used');},set(){throw Error('Not used');}};
 const client=createCatalogUpdates({cache,fetchFn:async url=>{calls.push(url);return response(national());}});
 assert.equal((await client.read(path)).source,'published');assert.deepEqual(calls,['./'+path]);
});

test('malformed, empty, negative-price and HTTP responses cannot replace the last good catalogue',async()=>{
 const good=national(),bad=[{},null,{chargers:[]},national('wrong')];bad[3].chargers[0].price=-1;
 for(const input of [...bad,'http','json']){
  const cache=memory([[path,record(good)]]);
  const client=createCatalogUpdates({native:true,cache,fetchFn:async()=>input==='http'?response({},503):input==='json'?{ok:true,json:async()=>{throw Error('Truncated JSON');}}:response(input)});
  const actual=await client.read(path,{force:true});assert.equal(actual.source,'cached');assert.deepEqual(actual.data,good);assert.deepEqual(cache.entries.get(path).data,good);
 }
});

test('a country consumer validates record count and licences before the replacement is stored',async()=>{
 const file='data/international/RU.json';
 const russian=id=>({...station(id),country:'RU',sourceUrl:'https://openchargemap.org/site/poi/details/1',dataProvider:{licenseUrl:'https://creativecommons.org/licenses/by/4.0/'}});
 const good={country:'RU',updatedAt:'2026-11-15T00:00:00Z',chargers:[russian('one')]},mismatch={country:'RU',updatedAt:'2026-11-16T00:00:00Z',chargers:[russian('one'),russian('two')]};
 const cache=memory([[file,record(good,1000,file)]]),client=createCatalogUpdates({native:true,cache,fetchFn:async()=>response(mismatch)});
 const validate=value=>{assert.equal(value.chargers.length,1);return value.chargers;};
 const actual=await client.read(file,{force:true,validate});assert.deepEqual(actual.data,good);assert.deepEqual(cache.entries.get(file).data,good);
 const invalidLicence=copy(good);invalidLicence.chargers[0].dataProvider.licenseUrl='javascript:bad';assert.throws(()=>validateCatalogResource(file,invalidLicence));
});

test('consumer validation can return an array without changing the cached country document',async()=>{
 const file='data/international/RU.json',data={country:'RU',chargers:[{...station(),country:'RU',sourceUrl:'https://openchargemap.org/site/poi/details/1',dataProvider:{licenseUrl:'https://creativecommons.org/licenses/by/4.0/'}}]};
 const cache=memory(),client=createCatalogUpdates({native:true,cache,fetchFn:async()=>response(data)});
 const value=await client.read(file,{validate:document=>document.chargers});assert.deepEqual(value.data,data);assert.deepEqual(cache.entries.get(file).data,data);
});

test('corrupt cached entries and invalid publications fall back to the bundled snapshot',async()=>{
 const cache=memory([[path,{version:1,path,savedAt:1000,data:{chargers:[]}}]]),embedded=national('bundled'),calls=[];
 const client=createCatalogUpdates({native:true,cache,fetchFn:async url=>{calls.push(url);return response(url.startsWith('https:')?{}:embedded);}});
 const actual=await client.read(path);assert.equal(actual.source,'embedded');assert.deepEqual(actual.data,embedded);assert.match(actual.warning,/copia guardada/);assert.equal(calls.length,2);
});

test('timeouts interrupt a non-cooperative response body and retain the previous cache',async()=>{
 const good=national(),cache=memory([[path,record(good)]]);
 const client=createCatalogUpdates({native:true,cache,timeoutMs:15,fetchFn:async()=>({ok:true,json:()=>new Promise(()=>{})})});
 const actual=await client.read(path,{force:true});assert.equal(actual.source,'cached');assert.deepEqual(actual.data,good);assert.deepEqual(cache.entries.get(path).data,good);
});

test('external cancellation propagates immediately without saving or starting a bundled fallback',async()=>{
 const started=deferred(),controller=new AbortController(),cache=memory(),calls=[];
 const client=createCatalogUpdates({native:true,cache,fetchFn:url=>{calls.push(url);started.resolve();return new Promise(()=>{});}});
 const pending=client.read(path,{signal:controller.signal});await started.promise;const reason=new DOMException('Stop','AbortError');controller.abort(reason);
 await assert.rejects(pending,error=>error===reason);assert.deepEqual(calls,[PUBLISHED_CATALOG_BASE+path]);assert.equal(cache.entries.size,0);
});

test('storage quota failure permits the downloaded catalogue and clearly warns that it was not saved',async()=>{
 const good=national('old'),next=national('new','2026-11-16T11:00:00Z'),cache=memory([[path,record(good)]]);cache.set=async()=>{throw new DOMException('Full','QuotaExceededError');};
 const client=createCatalogUpdates({native:true,cache,fetchFn:async()=>response(next)}),actual=await client.read(path,{force:true});
 assert.equal(actual.source,'published');assert.deepEqual(actual.data,next);assert.match(actual.warning,/no se pudo guardar/i);assert.deepEqual(cache.entries.get(path).data,good);
});

test('a stuck cache cannot leave a permanent read or commit queue',async()=>{
 const cache={get:()=>new Promise(()=>{}),set:async()=>{}},client=createCatalogUpdates({native:true,cache,cacheTimeoutMs:5,fetchFn:async()=>response(national())});
 for(let index=0;index<2;index++){const actual=await client.read(path,{force:true});assert.equal(actual.source,'published');assert.match(actual.warning,/copia guardada/);}
});

test('a timed-out write remains a barrier so it cannot later overwrite a newer persisted catalogue',async()=>{
 const old=national('old','2026-11-15T12:00:00Z'),next=national('new','2026-11-16T12:00:00Z'),firstWrite=deferred(),cache=memory();let writes=0;
 cache.set=async(key,value)=>{writes++;if(writes===1)await firstWrite.promise;cache.entries.set(key,copy(value));};
 const one=createCatalogUpdates({native:true,cache,cacheTimeoutMs:5,fetchFn:async()=>response(old)});
 const two=createCatalogUpdates({native:true,cache,cacheTimeoutMs:5,fetchFn:async()=>response(next)});
 assert.equal((await one.read(path,{force:true})).source,'published');
 const during=await two.read(path,{force:true});assert.deepEqual(during.data,next);assert.match(during.warning,/copia anterior guardándose/);assert.equal(writes,1);
 firstWrite.resolve();await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(cache.entries.get(path).data,old);
 const saved=await two.read(path,{force:true});assert.deepEqual(saved.data,next);assert.equal(writes,2);assert.deepEqual(cache.entries.get(path).data,next);
});

test('an indefinitely pending cache write does not block later downloads or create more writes',async()=>{
 const cache=memory();let writes=0;cache.set=()=>{writes++;return new Promise(()=>{});};
 let responseCount=0;const client=createCatalogUpdates({native:true,cache,cacheTimeoutMs:5,fetchFn:async()=>response(national('download-'+(++responseCount)))});
 const first=await client.read(path,{force:true}),second=await client.read(path,{force:true});
 assert.equal(first.data.chargers[0].id,'download-1');assert.equal(second.data.chargers[0].id,'download-2');assert.match(second.warning,/copia anterior guardándose/);assert.equal(writes,1);
});

test('an older publication and a late older response cannot roll back a newer source snapshot',async()=>{
 const newer=national('new','2026-11-16T12:00:00Z'),older=national('old','2026-11-15T12:00:00Z'),cache=memory([[path,record(newer,1000)]]);
 const client=createCatalogUpdates({native:true,cache,fetchFn:async()=>response(older)});
 const retained=await client.read(path,{force:true});assert.deepEqual(retained.data,newer);assert.equal(retained.source,'cached');assert.equal(cache.entries.get(path).data.updated,newer.updated);
 const gate=deferred(),empty=memory();
 // Explicitly control request completion rather than rely on timer ordering.
 const waiting=deferred();let requests=0;
 const controlled=createCatalogUpdates({native:true,cache:empty,fetchFn:async()=>++requests===1?(waiting.resolve(),await gate.promise):response(newer)});
 const first=controlled.read(path,{force:true});await waiting.promise;const second=await controlled.read(path,{force:true});gate.resolve(response(older));const last=await first;
 assert.deepEqual(second.data,newer);assert.deepEqual(last.data,newer);assert.deepEqual(empty.entries.get(path).data,newer);
});

test('arbitrary URLs, traversal, query strings and unapproved data files are refused before fetching',async()=>{
 let calls=0;const client=createCatalogUpdates({native:true,fetchFn:async()=>{calls++;return response(national());}});
 for(const file of ['https://evil.example/data/chargers-spain.json','../data/chargers-spain.json','data/chargers-spain.json?key=secret','data/reve-cache.json','data/international/../../x.json','data/international/ru.json'])await assert.rejects(()=>client.read(file));
 assert.equal(calls,0);
});

test('CacheStorage adapter keeps only public JSON in local private keys and uses atomic put',async()=>{
 const responses=new Map(),opened=[],storage={async open(name){opened.push(name);return {async match(request){return responses.get(request.url)?.clone();},async put(request,value){responses.set(request.url,value.clone());}};}};
 const cache=createCatalogCache({storage,origin:'https://localhost'}),data=record(national());await cache.set(path,data);
 assert.deepEqual(await cache.get(path),data);assert.deepEqual(opened,[CATALOG_CACHE_NAME,CATALOG_CACHE_NAME]);
 assert.deepEqual([...responses.keys()],['https://localhost/__cg_catalog_cache_v1__/'+path]);assert.equal(await cache.get('data/operator-tariffs.json'),null);
 assert.equal(createCatalogCache({storage,origin:'https://localhost'}),cache,'clients with the same native cache share the write barrier');
 assert.equal(createCatalogCache({storage:{}}),null);
});

test('reference tariffs preserve unknown prices and reject amounts/currencies that would be mislabelled',()=>{
 const file='data/operator-tariffs.json',data={currency:'EUR',unit:'kWh',operators:[{id:'fixture',name:'Fixture',tiers:[{label:'Unknown',price:null},{label:'Simulation',price:0}]}]};
 assert.deepEqual(validateCatalogResource(file,data),data);
 assert.throws(()=>validateCatalogResource(file,{...data,currency:'USD'}));
 assert.throws(()=>validateCatalogResource(file,{...data,operators:[{id:'x',name:'X',tiers:[{label:'Wrong',price:'0'}]}]}));
});
