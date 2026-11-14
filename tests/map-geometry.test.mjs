import test from 'node:test';
import assert from 'node:assert/strict';
import {longitudeInWorld,routeDisplayGeometry,unwrapRouteCoordinates} from '../src/map-geometry.mjs';

test('eastbound and westbound date-line routes draw locally without changing their source coordinates',()=>{
 for(const direction of [1,-1]){
  const source=Object.freeze([Object.freeze([66,179*direction]),Object.freeze([66,-179*direction]),Object.freeze([65,-178*direction])]);
  const display=unwrapRouteCoordinates(source);
  assert.deepEqual(display,[[66,179*direction],[66,181*direction],[65,182*direction]]);
  assert.deepEqual(source,[[66,179*direction],[66,-179*direction],[65,-178*direction]]);
  assert.notEqual(display[0],source[0]);
 }
});

test('ordinary routes and exact half-world segments keep their original orientation',()=>{
 const route=[[40.4,-3.7],[48.85,2.35],[52.5,13.4]];
 assert.deepEqual(unwrapRouteCoordinates(route),route);
 assert.deepEqual(unwrapRouteCoordinates([[0,0],[0,-180],[0,0]]),[[0,0],[0,-180],[0,0]]);
});

test('stop markers follow the same world copy through outbound and return date-line crossings',()=>{
 const route=[[66,179],[66,-179],[66,179]];
 const stops=Object.freeze([Object.freeze([66,-179.1]),Object.freeze([66,179.1])]);
 const display=routeDisplayGeometry(route,stops);
 assert.deepEqual(display.coordinates,[[66,179],[66,181],[66,179]]);
 assert.deepEqual(display.stops,[[66,180.9],[66,179.1]]);
 assert.deepEqual(stops,[[66,-179.1],[66,179.1]]);
});

test('markers near later legs keep their route copy on a multi-world itinerary',()=>{
 const route=[[0,170],[10,-170],[20,-10],[30,150],[40,-50],[50,110]];
 const display=routeDisplayGeometry(route,[[40,-50],[50,110]]);
 assert.deepEqual(display.coordinates,[[0,170],[10,190],[20,350],[30,510],[40,670],[50,830]]);
 assert.deepEqual(display.stops,[[40,670],[50,830]]);
});

test('catalogue markers can be displayed on either side of a viewport across 180 degrees',()=>{
 assert.equal(longitudeInWorld(-179.9,180),180.1);
 assert.equal(longitudeInWorld(179.9,-180),-180.1);
 assert.equal(longitudeInWorld(-3.7,-3),-3.7);
 assert.equal(longitudeInWorld(-179.9,540),540.1);
});

test('empty routes preserve independent stop positions and malformed geometry is rejected',()=>{
 assert.deepEqual(routeDisplayGeometry([],[[40,-3]]),{coordinates:[],stops:[[40,-3]]});
 assert.deepEqual(unwrapRouteCoordinates([]),[]);
 for(const point of [[91,0],[0,181],[NaN,0],[0,null],['40',0],[40]]){
  assert.throws(()=>unwrapRouteCoordinates([point]));
  assert.throws(()=>routeDisplayGeometry([], [point]));
 }
 assert.throws(()=>unwrapRouteCoordinates(null));
 assert.throws(()=>longitudeInWorld(0,Infinity));
});
