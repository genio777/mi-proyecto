import test from 'node:test';
import assert from 'node:assert/strict';
import {planTrip,vehicleSpecification,compatibleSocket,eligibleForMode,chargingMinutes,PlanningError} from '../src/planner.mjs';
import {createRoadProvider} from '../src/road-provider.mjs';
const coord=km=>[0,km/111.1950802335329];
const station=(id,km,power=150,extra={})=>({id,name:id,lat:coord(km)[0],lng:coord(km)[1],power,connector:'CCS',connectors:[{type:'CCS',powerKw:power}],price:null,...extra});
const tesla=vehicleSpecification('Tesla Model Y Standard Range');
const zoe=vehicleSpecification('Renault Zoe R90');
function fixtureProvider({drivePenalty=()=>0,roadFactor=1,unreachable=()=>false}={}){
 const metric=(a,b)=>unreachable(a,b)?null:{km:Math.abs(a[1]-b[1])*111.1950802335329*roadFactor,minutes:Math.abs(a[1]-b[1])*111.1950802335329*.6+drivePenalty(a,b)};
 return {route:async(a,b,geometry)=>{const m=metric(a,b);return m?{...m,coordinates:geometry?[a,b]:undefined}:null;},metrics:async(a,targets)=>targets.map(b=>metric(a,b)),matrix:async(sources,targets)=>sources.map(a=>targets.map(b=>metric(a,b)))};
}
const options=(overrides={})=>({origin:coord(0),destinations:[coord(300)],stations:[station('A',150)],vehicle:tesla,batteryKwh:60,consumptionKwh:20,soc:100,reserve:10,mode:'fast',provider:fixtureProvider(),perBucket:0,...overrides});
test('fast ignores a saved upper bound and requires >=100 kW on a genuinely compatible socket',()=>{
 assert.equal(eligibleForMode(station('350',10,350),tesla,{mode:'fast',maximumPower:22}),true);
 assert.equal(eligibleForMode(station('megawatt',10,2000),tesla,{mode:'fast',maximumPower:22}),true);
 assert.equal(eligibleForMode(station('99',10,99.9),tesla,{mode:'fast'}),false);
 const mixed=station('mixed',10,350,{connector:'CCS, Tipo2',connectors:[{type:'CCS',powerKw:350},{type:'Tipo2',powerKw:22}]});
 assert.equal(compatibleSocket(mixed,zoe).powerKw,22);
 assert.equal(eligibleForMode(mixed,zoe,{mode:'fast'}),false);
 assert.equal(eligibleForMode(mixed,tesla,{mode:'fast',connectorFilters:['Tipo2']}),false);
 assert.equal(compatibleSocket(station('gbt',0,350,{connectors:[{type:'GB/T DC',powerKw:350}]}),tesla),null);
});
test('vehicle limits and explicit empty/unmatched sockets never inherit a site maximum',()=>{
 assert.equal(compatibleSocket(station('HPC',0,600),tesla).powerKw,170);
 assert.equal(compatibleSocket(station('AC',0,43,{connector:'Tipo2',connectors:[{type:'Tipo2',powerKw:43}]}),zoe).powerKw,22);
 assert.equal(compatibleSocket(station('empty',0,350,{connectors:[]}),tesla),null);
 assert.equal(compatibleSocket(station('mixed',0,350,{connectors:undefined,connector:'CCS, Tipo2'}),tesla),null);
 assert.equal(compatibleSocket(station('wrong',0,350,{connectors:[{type:'CCS',powerKw:350,powerType:'AC'}]}),tesla),null);
 assert.equal(eligibleForMode(station('private',0,350,{publicAccess:false}),tesla,{mode:'fast'}),false);
});
test('fast compares driving detours and charging, rather than sorting station peak power',async()=>{
 const slow=station('on-road-100',150,100),fast=station('detour-350',150,350,{lat:.02});
 const penalty=(a,b)=>Math.abs(a[0])>.01||Math.abs(b[0])>.01?50:0;
 const result=await planTrip(options({stations:[slow,fast],provider:fixtureProvider({drivePenalty:penalty})}));
 assert.deepEqual(result.stops.map(s=>s.station.id),['on-road-100']);
 assert.equal(result.totalMinutes,result.driveMinutes+result.chargingMinutes);
 const equalRoad=await planTrip(options({stations:[slow,fast]}));
 assert.deepEqual(equalRoad.stops.map(s=>s.station.id),['detour-350']);
 assert.ok(result.stops[0].departureSoc<100,'last stop should be a partial charge');
});
test('three destinations share one energy state; charging before an intermediate destination can be necessary',async()=>{
 const result=await planTrip(options({batteryKwh:50,destinations:[coord(150),coord(300),coord(320)],stations:[station('before-first',100),station('after-first',250)]}));
 assert.equal(result.arrivals.length,3);
 assert.ok(result.stops.some(s=>s.station.id==='before-first'));
 assert.ok(result.arrivals.every(a=>a.soc>=10-1e-7));
 assert.ok(result.stops[0].departureSoc>50,'must retain energy for the next stage');
});
test('return trips may charge at the same station again; no implicit recharge at destinations',async()=>{
 const result=await planTrip(options({batteryKwh:40,destinations:[coord(180),coord(0)],stations:[station('shared',100)]}));
 assert.deepEqual(result.stops.map(s=>s.station.id),['shared','shared']);
 assert.equal(result.arrivals.length,2);
 assert.ok(result.arrivals[0].soc<100);
 assert.ok(result.arrivalSoc>=10-1e-7);
});
test('station at the origin remains usable when low SOC cannot reach a distant station',async()=>{
 const result=await planTrip(options({destinations:[coord(100)],soc:10,reserve:5,stations:[station('origin',0)]}));
 assert.equal(result.stops[0].station.id,'origin');
 assert.ok(result.arrivalSoc>=5-1e-7);
});
test('long international-style trips have no arbitrary 8/24/40-stop cutoff',async()=>{
 const stations=Array.from({length:43},(_,i)=>station('S'+(i+1),i+1));
 const result=await planTrip(options({batteryKwh:1,consumptionKwh:80,reserve:0,destinations:[coord(15),coord(30),coord(44)],stations,maxRoadRequests:100}));
 assert.equal(result.stops.length,43);
 assert.equal(result.arrivals.length,3);
 assert.ok(result.arrivals.every(a=>a.soc>=0));
});
test('road distance, not straight line distance, establishes reachability',async()=>{
 await assert.rejects(()=>planTrip(options({destinations:[coord(200)],stations:[],provider:fixtureProvider({roadFactor:2})})),e=>e.code==='NO_FEASIBLE_PLAN');
});
test('unknown prices remain unknown and cannot enter a free route',async()=>{
 const result=await planTrip(options());
 assert.equal(result.unknownPriceStops,1);
 assert.equal(result.stops[0].quote,null);
 await assert.rejects(()=>planTrip(options({mode:'free'})),e=>e.code==='NO_FEASIBLE_PLAN');
});
test('search/resource limits report incomplete calculation, rather than an impossible road route',async()=>{
 await assert.rejects(()=>planTrip(options({maxStates:1})),e=>e.code==='SEARCH_INCOMPLETE');
 await assert.rejects(()=>planTrip(options({provider:{route:async()=>null}})),e=>e.code==='NO_ROAD_ROUTE');
});
test('AC/DC charging model respects delivered power and penalises high SOC',()=>{
 const ac=compatibleSocket(station('ac',0,43,{connectors:[{type:'Tipo2',powerKw:43}]}),zoe);
 assert.ok(chargingMinutes(ac,0,22,41)>=60);
 const socket=compatibleSocket(station('dc',0,350),tesla);
 assert.ok(chargingMinutes(socket,54,60,60)>chargingMinutes(socket,24,30,60));
});
test('provider distinguishes HTTP failures, unreachable pairs and zero-length pairs',async()=>{
 const limited=createRoadProvider({minIntervalMs:0,fetchImpl:async()=>({ok:false,status:429})});
 await assert.rejects(()=>limited.route(coord(0),coord(1)),e=>e.code==='ROUTING_SERVICE'&&/limitado/.test(e.message));
 const noRoad=createRoadProvider({minIntervalMs:0,fetchImpl:async()=>({ok:true,json:async()=>({code:'NoRoute'})})});
 assert.equal(await noRoad.route(coord(0),coord(1)),null);
 const noSegment=createRoadProvider({minIntervalMs:0,fetchImpl:async()=>({ok:false,status:400,json:async()=>({code:'NoSegment'})})});
 assert.equal(await noSegment.route(coord(0),coord(1)),null);
 const table=createRoadProvider({minIntervalMs:0,fetchImpl:async()=>({ok:true,json:async()=>({code:'Ok',distances:[[0,null,1000]],durations:[[0,null,60]]})})});
 assert.deepEqual(await table.metrics(coord(0),[coord(0),coord(1),coord(2)]),[{km:0,minutes:0},null,{km:1,minutes:1}]);
 const timeout=createRoadProvider({minIntervalMs:0,fetchImpl:async()=>{const error=new Error();error.name='TimeoutError';throw error;}});
 await assert.rejects(()=>timeout.route(coord(0),coord(1)),e=>e.code==='ROUTING_SERVICE'&&/tiempo de espera/.test(e.message));
});
test('cheapest mode compares known charging costs; null does not become a zero tariff',async()=>{
 const a=station('cheap',150,100,{price:.2}),b=station('expensive',150,350,{lat:.02,price:.8}),c=station('unknown',150,350,{lat:.01});
 const result=await planTrip(options({mode:'cheap',stations:[a,b,c],quote:(s,kwh)=>s.price==null?null:{total:s.price*kwh}}));
 assert.deepEqual(result.stops.map(s=>s.station.id),['cheap']);
 assert.equal(result.unknownPriceStops,0);
 assert.ok(result.cost>0);
});
test('a destination never adds battery energy automatically',async()=>{
 await assert.rejects(()=>planTrip(options({destinations:[coord(150),coord(300)],stations:[]})),e=>e.code==='NO_FEASIBLE_PLAN');
});
test('fractional SOC/reserve still permits a colocated charging station',async()=>{
 const result=await planTrip(options({destinations:[coord(100)],soc:15.5,reserve:15.2,stations:[station('origin',0)]}));
 assert.equal(result.stops[0].station.id,'origin');
 assert.ok(result.arrivalSoc>=15.2-1e-7);
});
test('final geometry distance, even within provider tolerance, must preserve reserve',async()=>{
 const provider=fixtureProvider(),original=provider.route;
 provider.route=async(a,b,full)=>{const result=await original(a,b,full);if(full&&a[1]>0&&b[1]>a[1])result.km+=.19;return result;};
 await assert.rejects(()=>planTrip(options({provider,destinations:[coord(301.2)]})),e=>['ENERGY_VALIDATION','ROUTE_CHANGED'].includes(e.code));
});
test('large coordinate-to-road snaps are excluded rather than inventing access to a charger',async()=>{
 const provider=createRoadProvider({minIntervalMs:0,fetchImpl:async()=>({ok:true,json:async()=>({code:'Ok',waypoints:[{distance:0},{distance:700}],routes:[{distance:1000,duration:60,geometry:{coordinates:[[0,0],[.01,0]]}}]})})});
 assert.equal(await provider.route(coord(0),coord(1)),null);
 const table=createRoadProvider({minIntervalMs:0,fetchImpl:async()=>({ok:true,json:async()=>({code:'Ok',sources:[{distance:0}],destinations:[{distance:700},{distance:30}],distances:[[1000,1000]],durations:[[60,60]]})})});
 assert.deepEqual(await table.metrics(coord(0),[coord(1),coord(2)]),[null,{km:1,minutes:1}]);
});
