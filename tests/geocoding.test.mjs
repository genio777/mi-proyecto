import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeocoder, normalizeCountry, parseCoordinates, prepareLocationQuery} from '../src/geocoding.mjs';

const feature = (countrycode = 'FR', coordinates = [2.35,48.85]) => ({geometry:{type:'Point',coordinates},properties:{countrycode}});
const response = (features = [feature()]) => ({ok:true,json:async()=>({features})});
const make = (fetchFn, options = {}) => createGeocoder({fetchFn,minimumIntervalMs:0,...options});

test('coordinate inputs support international ranges and decimal commas without network', async () => {
  assert.deepEqual(parseCoordinates('40,4168; -3,7038'), [40.4168,-3.7038]);
  assert.deepEqual(parseCoordinates('-33.8688, 151.2093'), [-33.8688,151.2093]);
  assert.deepEqual(parseCoordinates('55.75 37.62'), [55.75,37.62]);
  assert.throws(()=>parseCoordinates('91, 181'), /fuera de rango/);
  const geocode = make(()=>assert.fail('must not fetch'));
  assert.deepEqual(await geocode('90, -180'), [90,-180]);
});

test('countries with accents and Cyrillic normalize correctly', () => {
  assert.equal(normalizeCountry('Países Bajos'), 'paisesbajos');
  assert.deepEqual(prepareLocationQuery('Utrecht, Países Bajos'), {query:'Utrecht',country:'NL'});
  assert.deepEqual(prepareLocationQuery('Москва, Россия'), {query:'Москва',country:'RU'});
  assert.deepEqual(prepareLocationQuery('東京都, 日本'), {query:'東京都',country:'JP'});
  assert.deepEqual(prepareLocationQuery('10115 Alemania'), {query:'10115',country:'DE'});
});

test('postcodes use explicit countries instead of forcing five digits to Spain', () => {
  for (const code of ['28013','10115','75001','1010','119019','110001']) assert.throws(()=>prepareLocationQuery(code), /necesita país o localidad/);
  assert.deepEqual(prepareLocationQuery('75001, París, Francia'), {query:'75001, París',country:'FR'});
  assert.deepEqual(prepareLocationQuery('28013, España'), {query:'28013',country:'ES'});
  assert.deepEqual(prepareLocationQuery('1012ab'), {query:'1012 AB',country:'NL'});
  assert.deepEqual(prepareLocationQuery('SW1A 1AA'), {query:'SW1A 1AA',country:'GB'});
  assert.deepEqual(prepareLocationQuery('100-0001'), {query:'100-0001',country:'JP'});
});

test('addresses and unqualified cities remain global, road kilometre markers require coordinates', () => {
  assert.deepEqual(prepareLocationQuery('Unter den Linden 2, Berlin, Alemania'), {query:'Unter den Linden 2, Berlin',country:'DE'});
  assert.deepEqual(prepareLocationQuery('Singapore'), {query:'Singapore',country:'SG'});
  assert.deepEqual(prepareLocationQuery('Bangkok'), {query:'Bangkok',country:''});
  assert.throws(()=>prepareLocationQuery('A-4 km 25'), /coordenadas verificadas/);
});

test('real request contract is global Photon GeoJSON with country constraint', async () => {
  let requested;
  const geocode = make(async url => {requested = new URL(url); return response();});
  assert.deepEqual(await geocode('75001, París, Francia'), [48.85,2.35]);
  assert.equal(requested.origin, 'https://photon.komoot.io');
  assert.equal(requested.searchParams.get('countrycode'), 'FR');
  assert.equal(requested.searchParams.get('q'), '75001, París');
  assert.equal(requested.searchParams.has('bbox'), false);
});

test('explicit country never silently falls back to a different country', async () => {
  const geocode = make(async()=>response([feature('US')]));
  await assert.rejects(geocode('Paris, Francia'), /No se ha podido localizar/);
});

test('invalid provider coordinates and errors do not become map positions', async () => {
  for (const coordinates of [[null,48],[190,48],['2',48],[2,100]]) {
    await assert.rejects(make(async()=>response([feature('FR',coordinates)]))('Paris, Francia'), /No se ha podido localizar/);
  }
  await assert.rejects(make(async()=>({ok:false,status:429}))('Paris'), /limitado las consultas/);
});

test('requests serialize, duplicates reuse cache and no old Spain-biased cache is read', async () => {
  let time = 0, count = 0, active = 0, maximumActive = 0;
  const starts = [];
  const storage = new Map([['cg_geo_v6_paris',[1,1]]]);
  const geocode = make(async()=>{
    active++;maximumActive=Math.max(maximumActive,active);starts.push(time);count++;
    await Promise.resolve(); active--;return response();
  }, {minimumIntervalMs:1100,now:()=>time,sleep:async ms=>{time+=ms;},storage:{getItem:k=>JSON.stringify(storage.get(k)),setItem:(k,v)=>storage.set(k,JSON.parse(v))}});
  const values = await Promise.all([geocode('Paris'),geocode('Berlin'),geocode('Paris')]);
  assert.deepEqual(values, [[48.85,2.35],[48.85,2.35],[48.85,2.35]]);
  assert.deepEqual(starts,[0,1100]);
  assert.equal(count,2); assert.equal(maximumActive,1);
  assert.deepEqual(await geocode('Paris'),[48.85,2.35]); assert.equal(count,2);
});

test('expired and invalid cached values are ignored', async () => {
  let count = 0;
  const geocode = make(async()=>{count++;return response();}, {now:()=>31*86400000,storage:{getItem:()=>JSON.stringify({coords:[1,1],savedAt:0}),setItem:()=>{}}});
  assert.deepEqual(await geocode('Paris'),[48.85,2.35]); assert.equal(count,1);
});

test('cancellation prevents queued stale searches from reaching the provider', async () => {
  let release;
  const gate = new Promise(resolve=>release=resolve);
  let calls = 0;
  const geocode = make(async()=>{calls++;await gate;return response();});
  const first = geocode('Paris');
  const controller = new AbortController();
  const stale = geocode('Berlin',{signal:controller.signal});
  controller.abort();release();
  await first;
  await assert.rejects(stale, {name:'AbortError'});
  assert.equal(calls,1);
});

test('changing runtime endpoint keeps country filtering and refuses credential URLs', async () => {
  let requested;
  const geocode = make(async url=>{requested=new URL(url);return response();}, {endpoint:async()=> 'https://geocode.example/api/'});
  await geocode('Paris, Francia');
  assert.equal(requested.origin,'https://geocode.example');
  await assert.rejects(make(async()=>response(),{endpoint:'https://user:pass@geocode.example/api/'})('Paris'), /mal configurado/);
});
