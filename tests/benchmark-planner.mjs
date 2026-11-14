// Deterministic CPU benchmark; no network, credentials, or synthetic records enter the app.
import {performance} from 'node:perf_hooks';
import {planTrip,vehicleSpecification} from '../src/planner.mjs';
const scale=111.1950802335329,point=km=>[0,km/scale];
for(const km of [250,1000]){
 const count=5000,stations=Array.from({length:count},(_,i)=>({id:'fixture-'+i,lat:0,lng:km*(i+.5)/count/scale,power:350,connector:'CCS',connectors:[{type:'CCS',powerKw:350}],price:null}));
 let requests=0;const metric=(a,b)=>({km:Math.abs(a[1]-b[1])*scale,minutes:Math.abs(a[1]-b[1])*scale*.6});
 const provider={route:async(a,b)=>{requests++;return {...metric(a,b),coordinates:[a,b]};},matrix:async(sources,targets)=>{requests++;return sources.map(a=>targets.map(b=>metric(a,b)));},itinerary:async points=>{requests++;return {coordinates:points,legs:points.slice(1).map((p,i)=>metric(points[i],p))};}};
 const started=performance.now();
 const result=await planTrip({origin:point(0),destinations:[point(km/3),point(km*2/3),point(km)],stations,vehicle:vehicleSpecification('Tesla Model Y Standard Range'),batteryKwh:57.5,consumptionKwh:17,soc:35,reserve:15,mode:'cheap',provider,quote:(_station,kwh)=>({total:kwh*.4})});
 console.log(JSON.stringify({fixture:true,km,milliseconds:Math.round(performance.now()-started),catalogueStations:count,selectedCandidates:result.candidateStations,states:result.exploredStates,requests,stops:result.stops.length,arrivalSocs:result.arrivals.map(a=>a.soc)}));
}
