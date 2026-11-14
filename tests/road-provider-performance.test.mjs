import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoadProvider} from '../src/road-provider.mjs';

const point=i=>[i/100,i/1000];
const marker=p=>Math.round(p[0]*100);
const value=(a,b)=>marker(a)===marker(b)?0:marker(a)*100+marker(b)+1;
const metric=(a,b)=>({km:value(a,b),minutes:value(a,b)});
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
function requestShape(input){
 const url=new URL(input);
 const coordinates=url.pathname.split('/').at(-1).split(';').map(s=>{const [lng,lat]=s.split(',').map(Number);return [lat,lng]});
 const indices=(key,fallback)=>url.searchParams.has(key)?url.searchParams.get(key).split(';').map(Number):fallback;
 return {url,coordinates,sources:indices('sources',coordinates.map((_,i)=>i)),destinations:indices('destinations',coordinates.map((_,i)=>i))};
}
function tableData(input){
 const shape=requestShape(input),sources=shape.sources.map(i=>shape.coordinates[i]),targets=shape.destinations.map(i=>shape.coordinates[i]);
 return {code:'Ok',sources:sources.map(()=>({distance:0})),destinations:targets.map(()=>({distance:0})),distances:sources.map(a=>targets.map(b=>value(a,b)*1000)),durations:sources.map(a=>targets.map(b=>value(a,b)*60))};
}
function routeData(input){
 const {coordinates}=requestShape(input),legs=coordinates.slice(1).map(()=>({distance:1000,duration:60}));
 return {code:'Ok',waypoints:coordinates.map(()=>({distance:0})),routes:[{distance:legs.length*1000,duration:legs.length*60,geometry:{coordinates:coordinates.map(p=>[p[1],p[0]])},legs}]};
}
function fixtureProvider(transform=(_input,data)=>data,options={}){
 const calls=[];
 const provider=createRoadProvider({minIntervalMs:0,...options,fetchImpl:async(input,init)=>{
  calls.push({input,init,shape:requestShape(input)});
  const data=String(input).includes('/table/')?tableData(input):routeData(input);
  return response(await transform(input,data,calls.length,init));
 }});
 return {provider,calls};
}
const isRoutingError=error=>error?.code==='ROUTING_SERVICE';
const isAbort=error=>error?.name==='AbortError';

// These tests use only injected responses: no public OSRM service is queried.
test('a deduplicated directed rectangle is resolved by one table request',async()=>{
 const {provider,calls}=fixtureProvider();
 const sources=[point(1),point(2),point(1)],targets=[point(2),point(3),point(1)];
 assert.deepEqual(await provider.matrix(sources,targets),sources.map(a=>targets.map(b=>metric(a,b))));
 assert.equal(calls.length,1);
 assert.match(calls[0].shape.url.pathname,/\/table\/v1\/driving\//);
 assert.equal(calls[0].shape.coordinates.length,3);
 assert.equal(calls[0].shape.sources.length,2,'duplicate origins should not multiply table cells');
 assert.equal(calls[0].shape.destinations.length,3);
 assert.equal(new Set(calls[0].shape.coordinates.map(p=>JSON.stringify(p))).size,3);
 assert.equal(calls[0].shape.url.searchParams.get('annotations'),'distance,duration');
});

test('40 overlapping sources and targets use one table when their combined coordinates fit',async()=>{
 const {provider,calls}=fixtureProvider();
 const points=Array.from({length:40},(_,i)=>point(i+1));
 const result=await provider.matrix(points,points);
 assert.equal(calls.length,1);
 assert.equal(calls[0].shape.coordinates.length,40);
 assert.equal(result.length,40);
 assert.equal(result[0].length,40);
 assert.deepEqual(result[39][0],metric(points[39],points[0]));
 assert.notDeepEqual(result[39][0],result[0][39]);
});

test('a disjoint 26 by 26 rectangle uses four bounded 25 by 25 blocks',async()=>{
 const {provider,calls}=fixtureProvider();
 const sources=Array.from({length:26},(_,i)=>point(i+1)),targets=Array.from({length:26},(_,i)=>point(i+100));
 const result=await provider.matrix(sources,targets);
 assert.deepEqual(result,sources.map(a=>targets.map(b=>metric(a,b))));
 assert.equal(calls.length,4);
 for(const {shape}of calls){
  assert.ok(shape.coordinates.length<=50);
  assert.ok(shape.sources.length<=25);
  assert.ok(shape.destinations.length<=25);
 }
});

test('metrics uses a single table row and matrix cache entries retain their direction',async()=>{
 const {provider,calls}=fixtureProvider();
 const a=point(1),b=point(2),c=point(3);
 assert.deepEqual(await provider.metrics(a,[b,c]),[metric(a,b),metric(a,c)]);
 assert.equal(calls.length,1);
 assert.equal(calls[0].shape.sources.length,1);
 assert.deepEqual(await provider.matrix([a],[c,b]),[[metric(a,c),metric(a,b)]]);
 assert.equal(calls.length,1,'forward edge metrics should be cached');
 assert.deepEqual(await provider.matrix([b],[a]),[[metric(b,a)]]);
 assert.equal(calls.length,2,'a cached forward edge cannot answer a reverse edge');
 const stats=provider.getStats();
 assert.equal(stats.requests,2);
 assert.ok(stats.cacheHits>=1);
});

test('explicit unreachable pairs and colocated zero distances stay distinct',async()=>{
 const {provider}=fixtureProvider((_input,data)=>({...data,distances:[[0,null,1000]],durations:[[0,null,60]]}));
 assert.deepEqual(await provider.metrics(point(1),[point(1),point(2),point(3)]),[{km:0,minutes:0},null,{km:1,minutes:1}]);
});

test('a source snap excludes its row and a destination snap excludes its column',async()=>{
 const sources=[point(1),point(2)],targets=[point(3),point(4)];
 const {provider}=fixtureProvider((_input,data)=>({...data,sources:[{distance:250},{distance:251}],destinations:[{distance:0},{distance:300}]}));
 assert.deepEqual(await provider.matrix(sources,targets),[[metric(sources[0],targets[0]),null],[null,null]]);
});

for(const [label,transform]of [
 ['missing distance row',data=>({...data,distances:[]})],
 ['extra duration row',data=>({...data,durations:[...data.durations,[60]]})],
 ['wrong distance columns',data=>({...data,distances:[[1000,2000]]})],
 ['NaN distance',data=>({...data,distances:[[NaN]]})],
 ['infinite duration',data=>({...data,durations:[[Infinity]]})],
 ['negative distance',data=>({...data,distances:[[-1]]})],
 ['negative duration',data=>({...data,durations:[[-1]]})],
 ['distance-only null',data=>({...data,distances:[[null]],durations:[[0]]})],
 ['duration-only null',data=>({...data,distances:[[0]],durations:[[null]]})]
]){
 test('invalid matrix response fails visibly: '+label,async()=>{
  const {provider}=fixtureProvider((_input,data)=>transform(data));
  await assert.rejects(()=>provider.matrix([point(1)],[point(2)]),isRoutingError);
 });
}

test('an invalid later matrix cell cannot poison the cache with an earlier valid cell',async()=>{
 const {provider,calls}=fixtureProvider((_input,data,count)=>count===1?{...data,distances:[data.distances[0],[NaN,...data.distances[1].slice(1)]]}:data);
 await assert.rejects(()=>provider.matrix([point(1),point(2)],[point(3),point(4)]),isRoutingError);
 assert.deepEqual(await provider.matrix([point(1)],[point(3)]),[[metric(point(1),point(3))]]);
 assert.equal(calls.length,2);
});

test('an error after a successful block does not commit partial matrix results',async()=>{
 const {provider,calls}=fixtureProvider((_input,data,count)=>count===2?{...data,distances:[]}:data);
 const sources=Array.from({length:26},(_,i)=>point(i+1)),targets=Array.from({length:26},(_,i)=>point(i+100));
 await assert.rejects(()=>provider.matrix(sources,targets),isRoutingError);
 const before=calls.length;
 assert.deepEqual(await provider.matrix([sources[0]],[targets[0]]),[[metric(sources[0],targets[0])]]);
 assert.equal(calls.length,before+1,'the failed transaction must not retain its first block');
});

test('indexed NoSegment isolates only the proven point and retries the residual table once',async()=>{
 const calls=[];
 const provider=createRoadProvider({minIntervalMs:0,fetchImpl:async input=>{
  calls.push(requestShape(input));
  return calls.length===1?response({code:'NoSegment',message:'Could not find a matching segment for coordinate 1'},400):response(tableData(input));
 }});
 const result=await provider.matrix([point(1),point(2)],[point(2),point(3)]);
 assert.deepEqual(result,[[null,metric(point(1),point(3))],[null,null]]);
 assert.equal(calls.length,2);
 assert.ok(calls.every(call=>call.url.pathname.includes('/table/')),'no per-pair route fallback');
 assert.deepEqual(calls[1].coordinates,[point(1),point(3)]);
 assert.equal(provider.getStats().isolatedPoints,1);
});

for(const [label,message]of [['unindexed','Could not find a matching segment'],['out-of-range','Could not find a matching segment for coordinate 99']]){
 test('NoSegment without a usable index fails without inventing unreachable pairs: '+label,async()=>{
  let requests=0;
  const provider=createRoadProvider({minIntervalMs:0,fetchImpl:async()=>{requests++;return response({code:'NoSegment',message},400)}});
  await assert.rejects(()=>provider.matrix([point(1)],[point(2)]),isRoutingError);
  assert.equal(requests,1);
 });
}

test('a second indexed NoSegment failure stops after one retry',async()=>{
 let requests=0;
 const provider=createRoadProvider({minIntervalMs:0,fetchImpl:async()=>{requests++;return response({code:'NoSegment',message:'Could not find a matching segment for coordinate 1'},400)}});
 await assert.rejects(()=>provider.matrix([point(1),point(2)],[point(3),point(4)]),isRoutingError);
 assert.equal(requests,2);
});

for(const status of [404,429]){
 test('HTTP '+status+' is a service error, not an unreachable road leg',async()=>{
  const provider=createRoadProvider({minIntervalMs:0,fetchImpl:async()=>response({code:'InvalidUrl'},status)});
  await assert.rejects(()=>provider.matrix([point(1)],[point(2)]),error=>isRoutingError(error)&&new RegExp(status===429?'limitad|429':'404').test(error.message));
 });
}

test('a provider timeout remains a visible routing error',async()=>{
 const provider=createRoadProvider({minIntervalMs:0,fetchImpl:async()=>{throw new DOMException('Fixture timeout','TimeoutError')}});
 await assert.rejects(()=>provider.matrix([point(1)],[point(2)]),error=>isRoutingError(error)&&/tiempo|timeout/i.test(error.message));
});

test('the configured timeout releases a hung injected fetch even when it ignores its signal',async()=>{
 const provider=createRoadProvider({minIntervalMs:0,timeoutMs:10,fetchImpl:()=>new Promise(()=>{})});
 await assert.rejects(()=>provider.matrix([point(1)],[point(2)]),error=>isRoutingError(error)&&/tiempo|timeout/i.test(error.message));
});

test('request budget stops additional network calls with an incomplete-calculation error',async()=>{
 const {provider,calls}=fixtureProvider(undefined,{maxRequests:1});
 await provider.matrix([point(1)],[point(2)]);
 await assert.rejects(()=>provider.matrix([point(1)],[point(3)]),error=>error?.code==='ROUTING_BUDGET'&&/incompleto/i.test(error.message));
 assert.equal(calls.length,1);
});

test('a queued matrix request aborts before an active request is released',async()=>{
 let release,started,requests=0;
 const ready=new Promise(resolve=>{started=resolve});
 const provider=createRoadProvider({minIntervalMs:0,fetchImpl:async input=>{
  requests++;
  if(requests===1){started();await new Promise(resolve=>{release=resolve})}
  return response(String(input).includes('/table/')?tableData(input):routeData(input));
 }});
 const active=provider.route(point(1),point(2),true);
 await ready;
 const controller=new AbortController();
 const queued=provider.matrix([point(3)],[point(4)],{signal:controller.signal}).then(()=>({ok:true}),error=>({error}));
 controller.abort(new DOMException('Fixture cancelled while queued','AbortError'));
 let deadline;
 try{
  const outcome=await Promise.race([queued,new Promise(resolve=>{deadline=setTimeout(()=>resolve({timedOut:true}),300)})]);
  assert.equal(outcome.timedOut,undefined,'queued cancellation waited for an unrelated active request');
  assert.ok(isAbort(outcome.error));
  assert.equal(requests,1);
 }finally{clearTimeout(deadline);release();await active;await queued}
});

test('an aborted in-flight route is not cached and the same edge can be retried',async()=>{
 let started,requests=0;
 const ready=new Promise(resolve=>{started=resolve});
 const provider=createRoadProvider({minIntervalMs:0,fetchImpl:async(input,{signal})=>{
  requests++;
  if(requests===1){started();await new Promise((_resolve,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true})})}
  return response(routeData(input));
 }});
 const controller=new AbortController();
 const pending=provider.route(point(1),point(2),true,{signal:controller.signal});
 const rejected=assert.rejects(pending,isAbort);
 await ready;controller.abort(new DOMException('Fixture cancelled in flight','AbortError'));await rejected;
 const result=await provider.route(point(1),point(2),true);
 assert.equal(result.km,1);
 assert.equal(requests,2);
});

test('a chosen path with eight legs obtains one route geometry with validated leg metrics',async()=>{
 const {provider,calls}=fixtureProvider();
 const points=Array.from({length:9},(_,i)=>point(i+1));
 const result=await provider.path(points);
 assert.equal(calls.length,1);
 assert.match(calls[0].shape.url.pathname,/\/route\/v1\/driving\//);
 assert.equal(calls[0].shape.coordinates.length,9);
 assert.equal(result.km,8);
 assert.equal(result.minutes,8);
 assert.deepEqual(result.legs,Array.from({length:8},()=>({km:1,minutes:1})));
 assert.deepEqual(result.coordinates,points);
});

test('a path with an invalid leg cannot become a valid final itinerary',async()=>{
 const {provider}=fixtureProvider((_input,data)=>{data.routes[0].legs[1].duration=-1;return data});
 await assert.rejects(()=>provider.path([point(1),point(2),point(3)]),isRoutingError);
});

test('path chunk boundaries share their junction without losing or duplicating a leg',async()=>{
 const {provider,calls}=fixtureProvider();
 const points=Array.from({length:51},(_,i)=>point(i+1));
 const result=await provider.path(points);
 assert.equal(calls.length,2);
 assert.equal(calls[0].shape.coordinates.length,50);
 assert.equal(calls[1].shape.coordinates.length,2);
 assert.deepEqual(calls[0].shape.coordinates.at(-1),calls[1].shape.coordinates[0]);
 assert.equal(result.legs.length,50);
 assert.equal(result.km,50);
 assert.deepEqual(result.coordinates,points);
});
