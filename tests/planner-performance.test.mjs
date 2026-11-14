import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {planTrip,vehicleSpecification} from '../src/planner.mjs';
const scale=111.1950802335329,point=km=>[0,km/scale];
const station=(id,km)=>({id,lat:0,lng:km/scale,power:350,connector:'CCS',connectors:[{type:'CCS',powerKw:350}],price:null});
function providerFixture({metric=(a,b)=>({km:Math.abs(a[1]-b[1])*scale,minutes:Math.abs(a[1]-b[1])*scale*.6}),matrixTransform=table=>table}={}){
 const calls={route:0,matrix:0,itinerary:0,rows:0},batches=[];
 const provider={calls,batches,
  async route(a,b,geometry){calls.route++;const road=metric(a,b);return road?{...road,coordinates:geometry?[a,b]:undefined}:null;},
  async matrix(sources,targets){calls.matrix++;batches.push(new Set([...sources,...targets].map(p=>p.join(','))).size);return matrixTransform(sources.map(a=>targets.map(b=>metric(a,b))));},
  async metrics(a,targets){calls.rows++;return targets.map(b=>metric(a,b));},
  async itinerary(points){calls.itinerary++;return {coordinates:points,legs:points.slice(1).map((p,i)=>metric(points[i],p))};}
 };
 return provider;
}
const options=(extra={})=>({origin:point(0),destinations:[point(300),point(550),point(1200)],stations:Array.from({length:153},(_,i)=>station('S'+i,5+i*7.8)),vehicle:vehicleSpecification('Tesla Model Y Standard Range'),batteryKwh:57.5,consumptionKwh:17,soc:90,reserve:15,mode:'fast',provider:providerFixture(),...extra});
test('153 international corridor candidates and three destinations use bounded matrix batches and one final itinerary',async()=>{
 const provider=providerFixture(),started=performance.now();
 const result=await planTrip(options({provider}));
 const requests=provider.calls.route+provider.calls.matrix+provider.calls.itinerary;
 assert.ok(requests<=20,JSON.stringify(provider.calls));
 assert.equal(provider.calls.rows,0,'must not revert to a table request for every origin');
 assert.equal(provider.calls.itinerary,1);
 assert.ok(provider.batches.every(count=>count<=50));
 assert.equal(result.arrivals.length,3);
 assert.ok(result.stops.length>=3);
 assert.ok(result.arrivals.every(a=>a.soc>=15-1e-7));
 assert.equal(result.unknownPriceStops,result.stops.length);
 assert.ok(performance.now()-started<5000,'CPU search should finish within five seconds without network latency');
});
test('a 69-point stage is covered by three full directed matrices, including internal blocks',async()=>{
 const provider=providerFixture();
 const result=await planTrip(options({provider,destinations:[point(650)],stations:Array.from({length:67},(_,i)=>station('S'+i,5+i*9.6)),perBucket:0}));
 assert.equal(result.candidateStations,67);
 assert.equal(provider.calls.matrix,3);
 assert.equal(provider.calls.itinerary,1);
 assert.ok(provider.batches.every(count=>count<=50));
});
test('43 charging stops retain complete SOC validation with one itinerary request',async()=>{
 const provider=providerFixture();
 const result=await planTrip(options({provider,batteryKwh:1,consumptionKwh:80,reserve:0,soc:100,destinations:[point(15),point(30),point(44)],stations:Array.from({length:43},(_,i)=>station('S'+i,i+1)),perBucket:0}));
 assert.equal(result.stops.length,43);
 assert.equal(provider.calls.itinerary,1);
 assert.ok(provider.calls.route+provider.calls.matrix+provider.calls.itinerary<=20);
 assert.ok(result.arrivals.every(a=>a.soc>=0));
});
test('the no-charge path never scans the station catalogue or requests road matrices',async()=>{
 const provider=providerFixture(),stations=new Proxy([],{get(){throw Error('catalogue should not be touched');}});
 const result=await planTrip(options({provider,stations,destinations:[point(20),point(40),point(60)]}));
 assert.equal(result.stops.length,0);
 assert.deepEqual(provider.calls,{route:3,matrix:0,itinerary:0,rows:0});
});
test('a rectangular, missing, or corrupt matrix is a provider error rather than no feasible route',async()=>{
 for(const matrixTransform of [table=>table.slice(1),table=>table.map(row=>row.slice(1)),table=>table.map((row,i)=>row.map((cell,j)=>i===0&&j===1?undefined:cell)),table=>table.map((row,i)=>row.map((cell,j)=>i===0&&j===1?{km:NaN,minutes:1}:cell))]){
  await assert.rejects(()=>planTrip(options({provider:providerFixture({matrixTransform})})),error=>error.code==='ROUTING_SERVICE');
 }
});
test('matrix direction and explicit zero-length legs remain authoritative',async()=>{
 const metric=(a,b)=>({km:Math.abs(a[1]-b[1])*scale*(b[1]>=a[1]?1:1.2),minutes:Math.abs(a[1]-b[1])*scale});
 const result=await planTrip(options({provider:providerFixture({metric}),batteryKwh:40,consumptionKwh:20,soc:100,reserve:10,destinations:[point(160),point(0)],stations:[station('same',100),station('origin',0)]}));
 assert.ok(Math.abs(result.km-352)<1e-5);
 assert.equal(result.arrivals.length,2);
 assert.ok(result.arrivals.every(a=>a.soc>=10-1e-7));
});
test('matrix request exhaustion is explicitly incomplete, never an impossible trip',async()=>{
 await assert.rejects(()=>planTrip(options({maxRoadRequests:3})),error=>error.code==='SEARCH_INCOMPLETE');
});
test('cancellation interrupts a queued or uncooperative matrix provider without waiting for it',async()=>{
 const provider=providerFixture(),controller=new AbortController();let matrixStarted=false;
 provider.matrix=async()=>{matrixStarted=true;controller.abort();return new Promise(()=>{});};
 const started=performance.now();
 await assert.rejects(()=>planTrip(options({provider,signal:controller.signal})),error=>error.code==='CANCELLED');
 assert.equal(matrixStarted,true);
 assert.ok(performance.now()-started<1000);
});
test('a global deadline interrupts an unresponsive provider and reports an incomplete calculation',async()=>{
 const provider=providerFixture();provider.matrix=async()=>new Promise(()=>{});
 const started=performance.now();
 await assert.rejects(()=>planTrip(options({provider,deadlineMs:30})),error=>error.code==='SEARCH_INCOMPLETE');
 assert.ok(performance.now()-started<1000);
});
test('CPU search yields to Android cancellation timers after road prefetch',async()=>{
 const provider=providerFixture(),controller=new AbortController();let armed=false;
 const promise=planTrip(options({provider,signal:controller.signal,yieldIntervalMs:0,onProgress:message=>{if(!armed&&message.startsWith('Optimizando recargas')){armed=true;setTimeout(()=>controller.abort(),0);}}}));
 await assert.rejects(()=>promise,error=>error.code==='CANCELLED');
 assert.equal(armed,true);
 assert.equal(provider.calls.itinerary,0,'must cancel before final validation');
});
test('CPU and catalogue work observe a deadline without inventing a negative route result',async()=>{
 const provider=providerFixture();
 await assert.rejects(()=>planTrip(options({provider,deadlineMs:0})),error=>error.code==='SEARCH_INCOMPLETE');
 assert.equal(provider.calls.route,0);
});
test('final itinerary legs revalidate battery reserve even if a matrix was slightly shorter',async()=>{
 const provider=providerFixture();
 provider.itinerary=async points=>({coordinates:points,legs:points.slice(1).map((p,i)=>({km:Math.abs(p[1]-points[i][1])*scale+.19,minutes:100}))});
 await assert.rejects(()=>planTrip(options({provider,destinations:[point(301.2)],stations:[station('A',150)],batteryKwh:60,consumptionKwh:20,soc:100,reserve:10})),error=>['ENERGY_VALIDATION','ROUTE_CHANGED'].includes(error.code));
});
test('a dense 250 km three-stage cost search stays responsive and verifies all arrivals',async t=>{
 const provider=providerFixture(),started=performance.now();
 const result=await planTrip(options({provider,destinations:[point(80),point(160),point(250)],stations:Array.from({length:5000},(_,i)=>station('D'+i,.1+i*.05)),soc:35,mode:'cheap',quote:(_station,kwh)=>({total:kwh*.4})}));
 const milliseconds=performance.now()-started;
 assert.equal(result.arrivals.length,3);
 assert.ok(result.stops.length>0);
 assert.ok(result.arrivals.every(a=>a.soc>=15-1e-7));
 assert.ok(provider.calls.route+provider.calls.matrix+provider.calls.itinerary<=20);
 assert.ok(milliseconds<5000,'CPU work should remain bounded on a dense catalogue');
 t.diagnostic(JSON.stringify({distanceKm:result.km,catalogueStations:5000,selected:result.candidateStations,milliseconds:Math.round(milliseconds),states:result.exploredStates,requests:provider.calls.route+provider.calls.matrix+provider.calls.itinerary}));
});
test('a 100 km three-destination charging trip shares one matrix and one final itinerary within four seconds',async()=>{
 const provider=providerFixture(),started=performance.now();
 const result=await planTrip(options({provider,destinations:[point(30),point(60),point(100)],stations:[station('near',20),station('middle',50),station('far',80)],soc:30,deadlineMs:4000}));
 assert.equal(result.arrivals.length,3);
 assert.ok(result.stops.length>0);
 assert.ok(result.arrivals.every(a=>a.soc>=15-1e-7));
 assert.equal(provider.calls.matrix,1,'all stage coordinates fit in one shared matrix');
 assert.equal(provider.calls.itinerary,1);
 assert.ok(provider.batches[0]<=50);
 assert.ok(performance.now()-started<4000);
});
