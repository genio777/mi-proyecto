import test from 'node:test';
import assert from 'node:assert/strict';
import {routeSearchBudget} from '../src/route-budget.mjs';

test('el límite de búsqueda crece a cuatro segundos por cada cien kilómetros',()=>{
 for(const [km,seconds] of [[100,4],[200,8],[250,10],[500,20],[750,30],[1000,40]])assert.equal(routeSearchBudget(km).milliseconds,seconds*1000);
});
test('los viajes cortos disponen de cuatro segundos y los muy largos no exceden cuarenta y cinco',()=>{
 for(const km of [0,1,25,99.99])assert.equal(routeSearchBudget(km).seconds,4);
 for(const km of [1125,2000,13000])assert.equal(routeSearchBudget(km).seconds,45);
});
test('el redondeo concede el siguiente segundo y rechaza distancias desconocidas',()=>{
 assert.equal(routeSearchBudget(100.01).seconds,5);
 assert.equal(routeSearchBudget(200.1).seconds,9);
 for(const km of [-1,NaN,Infinity,'100',null])assert.throws(()=>routeSearchBudget(km));
});
