import test from 'node:test';
import assert from 'node:assert/strict';
import {compatibleSocket,corridorCandidates,eligibleForMode,planTrip,routeSocket,vehicleSpecification} from '../src/planner.mjs';

const tesla=vehicleSpecification('Tesla Model Y Standard Range');
const zoe=vehicleSpecification('Renault Zoe R90');
const mixed={id:'fixture-mixed',lat:0,lng:0,power:350,connector:'CCS,Tipo2',connectors:[{type:'CCS',powerKw:350},{type:'Tipo2',powerKw:22}],price:null};

test('a mixed station retains its allowed AC socket when the nominal power ceiling excludes its CCS socket',()=>{
 for(const mode of ['cheap','free']){
  const station=mode==='free'?{...mixed,price:0}:mixed;
  assert.equal(eligibleForMode(station,tesla,{mode,maximumPower:50}),true);
  assert.deepEqual(routeSocket(station,tesla,{mode,maximumPower:50}),{type:'Tipo2',socketPowerKw:22,powerKw:11,ac:true});
 }
 assert.equal(compatibleSocket(mixed,tesla).type,'CCS','unrestricted compatibility keeps the fastest vehicle-compatible socket');
 assert.equal(routeSocket(mixed,tesla,{mode:'cheap',maximumPower:50,connectorFilters:['CCS']}),null);
 assert.equal(routeSocket({...mixed,publicAccess:false},tesla,{mode:'cheap',maximumPower:50}),null);
 assert.equal(routeSocket(mixed,tesla,{mode:'free',maximumPower:50}),null,'unknown price cannot become free when another socket is selected');
});

test('power ceilings use socket ratings rather than the lower vehicle charging limit',()=>{
 const ccsOnly={...mixed,connectors:[{type:'CCS',powerKw:350}]};
 assert.equal(routeSocket(ccsOnly,tesla,{mode:'cheap',maximumPower:170}),null);
 assert.equal(routeSocket(ccsOnly,tesla,{mode:'cheap',maximumPower:350}).powerKw,170);
 assert.equal(routeSocket(mixed,tesla,{mode:'cheap',maximumPower:11}),null,'a 22-kW socket remains nominally 22 kW on an 11-kW vehicle');
 assert.equal(routeSocket(mixed,zoe,{mode:'cheap',maximumPower:22}).powerKw,22);
 assert.equal(routeSocket(mixed,tesla,{mode:'fast',maximumPower:11}).socketPowerKw,350,'fast mode keeps its explicit no-upper-bound rule');
 assert.equal(routeSocket(mixed,zoe,{mode:'fast',maximumPower:350}),null);
});

test('a charging itinerary consistently uses and quotes the socket admitted by the nominal ceiling',async()=>{
 const scale=111.1950802335329,point=km=>[0,km/scale];
 const metric=(a,b)=>({km:Math.abs(a[1]-b[1])*scale,minutes:Math.abs(a[1]-b[1])*scale*.6});
 const provider={
  route:async(a,b)=>({...metric(a,b),coordinates:[a,b]}),
  matrix:async(sources,targets)=>sources.map(a=>targets.map(b=>metric(a,b))),
  itinerary:async points=>({coordinates:points,legs:points.slice(1).map((to,i)=>metric(points[i],to))}),
 };
 const quotedTypes=[];
 const result=await planTrip({origin:point(0),destinations:[point(100)],stations:[{...mixed,lng:point(10)[1]}],vehicle:tesla,batteryKwh:20,consumptionKwh:20,soc:30,reserve:10,mode:'cheap',maximumPower:50,provider,
  quote:(station,kwh)=>{quotedTypes.push(station._socket?.type);const rate=station._socket?.ac ? .3 : .9;return {total:kwh*rate,rate};},
 });
 assert.equal(result.stops.length,1);
 assert.equal(result.stops[0].socket.type,'Tipo2');
 assert.equal(result.stops[0].socket.socketPowerKw,22);
 assert.equal(result.stops[0].socket.powerKw,11);
 assert.ok(quotedTypes.length>0&&quotedTypes.every(type=>type==='Tipo2'));
 assert.equal(result.stops[0].quote.rate,.3);
 assert.ok(result.arrivals.every(arrival=>arrival.soc>=10-1e-7));
 assert.ok(result.chargingMinutes>60,'the AC alternative must not inherit CCS charging speed');
});

test('an antimeridian corridor selects stations near 180 degrees without creating a corridor through Greenwich',()=>{
 for(const latitude of [0,40,66])for(const direction of [1,-1]){
  const stations=[{id:'east',lat:latitude,lng:179.9},{id:'west',lat:latitude,lng:-179.9},{id:'exact-east',lat:latitude,lng:180},{id:'exact-west',lat:latitude,lng:-180},{id:'greenwich',lat:latitude,lng:0}];
  const route={coordinates:[[latitude,179*direction],[latitude,-179*direction]]};
  const candidates=corridorCandidates(stations,route,{perBucket:0});
  assert.deepEqual(candidates.map(candidate=>candidate.station.id).sort(),['east','exact-east','exact-west','west']);
  assert.ok(candidates.every(candidate=>candidate.nearest<=8),'all admitted records lie close to the actual short segment');
 }
});

test('neighbouring longitude cells wrap across 180 degrees even when the route itself stays on one side',()=>{
 for(const direction of [1,-1]){
  const route={coordinates:[[66,179.9*direction],[66,179.99*direction]]};
  const stations=[{id:'near-across',lat:66,lng:-179.99*direction},{id:'far',lat:66,lng:-176*direction}];
  assert.deepEqual(corridorCandidates(stations,route,{perBucket:0}).map(candidate=>candidate.station.id),['near-across']);
 }
 const greenwich={coordinates:[[40,-.1],[40,.1]]};
 assert.deepEqual(corridorCandidates([{id:'near',lat:40,lng:0},{id:'far',lat:40,lng:180}],greenwich,{perBucket:0}).map(candidate=>candidate.station.id),['near']);
});
