import {test as base,expect} from '@playwright/test';
import {routeResponse} from './helpers/osrm.mjs';

// Synthetic publications exercise update behavior. They never enter production data.
const station=(id,name)=>({id,name,city:'Fixture Madrid',country:'ES',lat:40.4,lng:-3.7,power:22,connector:'Tipo2',connectors:[{type:'Tipo2',powerKw:22}],price:null,source:'Synthetic browser fixture',verified:'No verificada',availability:'Desconocida'});
const kept=station('catalog-kept','Fixture kept station');
const old=station('catalog-old','Fixture old station');
const fresh=station('catalog-new','Fixture new station');
const publication=version=>({updated:new Date(Date.UTC(2026,10,16,version)).toISOString(),chargers:version===1?[kept,old]:[kept,fresh]});
const json=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
const tab=(page,name)=>page.locator('nav').getByRole('button',{name,exact:true}).click();
const region=page=>page.getByRole('region',{name:'Estado de los catálogos',exact:true});
const update=page=>region(page).getByRole('button',{name:'Actualizar catálogos',exact:true});
const nationalState=page=>region(page).locator('[data-catalog-resource="national"]');
const gate=()=>{let release;const promise=new Promise(resolve=>{release=resolve;});return {promise,release:()=>release()};};

const test=base.extend({
 page:async({page},use)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/data/operator-tariffs.json*',route=>json(route,{updated:'2026-11-16T00:00:00Z',operators:[]}));
  await page.route('**/data/international/index.json*',route=>json(route,{schemaVersion:1,countries:[]}));
  await page.route('**/tile.openstreetmap.org/**',route=>route.abort());
  await use(page);
  expect(errors,'catalogue refreshes and route deferral cause no uncaught browser errors').toEqual([]);
 },
});

test('manual refresh replaces obsolete stations and preserves saved personal data',async({page})=>{
 let version=1,requests=0;
 await page.route('**/data/chargers-spain.json*',route=>{requests++;return json(route,publication(version));});
 await page.addInitScript(()=>{
  localStorage.setItem('cg_favorites',JSON.stringify(['catalog-kept']));
  localStorage.setItem('cg_vehicle_profiles_v2',JSON.stringify({'Tesla Model Y Standard Range':{battery:58,consumption:18,maxCharge:170,maxAc:11}}));
 });
 await page.goto('/');
 await expect(page.getByRole('heading',{name:old.name,exact:true})).toBeVisible();
 const saved=await page.evaluate(()=>({favorites:localStorage.getItem('cg_favorites'),profiles:localStorage.getItem('cg_vehicle_profiles_v2')}));
 await tab(page,'seguridad');await expect(region(page)).toHaveAttribute('aria-busy','false');
 version=2;await update(page).click();
 await expect.poll(()=>requests).toBe(2);
 await expect(region(page)).toHaveAttribute('aria-busy','false');
 await expect(nationalState(page)).toHaveAttribute('data-catalog-source','published');
 await tab(page,'mapa');
 await expect(page.getByRole('heading',{name:fresh.name,exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:old.name,exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>({favorites:localStorage.getItem('cg_favorites'),profiles:localStorage.getItem('cg_vehicle_profiles_v2')}))).toEqual(saved);
 await tab(page,'favoritos');await expect(page.getByRole('heading',{name:kept.name,exact:true})).toBeVisible();
});

test('HTML, malformed prices and HTTP errors retain the last usable catalogue and allow retry',async({page})=>{
 let requests=0;
 await page.route('**/data/chargers-spain.json*',route=>{
  requests++;
  if(requests===2)return route.fulfill({status:200,contentType:'text/html',body:'<html>Fixture unavailable</html>'});
  if(requests===3)return json(route,{updated:'2026-11-16T03:00:00Z',chargers:[{...fresh,price:-1}]});
  if(requests===4)return json(route,{message:'Fixture unavailable'},503);
  return json(route,publication(requests===1?1:2));
 });
 await page.goto('/');await expect(page.getByRole('heading',{name:old.name,exact:true})).toBeVisible();
 await tab(page,'seguridad');await expect(region(page)).toHaveAttribute('aria-busy','false');
 for(const expected of [2,3,4]){
  await update(page).click();await expect.poll(()=>requests).toBe(expected);
  await expect(region(page)).toHaveAttribute('aria-busy','false');
  await expect(nationalState(page)).toContainText('No se ha podido obtener un catálogo válido de estaciones');
  await tab(page,'mapa');await expect(page.getByRole('heading',{name:old.name,exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:fresh.name,exact:true})).toHaveCount(0);
  await tab(page,'seguridad');
 }
 await update(page).click();await expect.poll(()=>requests).toBe(5);
 await expect(region(page)).toHaveAttribute('aria-busy','false');
 await expect(nationalState(page)).not.toContainText('No se ha podido obtener');
 await tab(page,'mapa');await expect(page.getByRole('heading',{name:fresh.name,exact:true})).toBeVisible();
});

test('a publication arriving during a route calculation is applied only after cancellation',async({page})=>{
 const nationalGate=gate(),roadGate=gate();let requests=0,roadStarted=false;
 await page.route('**/data/chargers-spain.json*',async route=>{
  const request=++requests;if(request===2)await nationalGate.promise;
  try{await json(route,publication(request===1?1:2));}catch{/* The test may close an aborted request. */}
 });
 await page.route('https://router.project-osrm.org/**',async route=>{
  roadStarted=true;await roadGate.promise;
  try{await json(route,routeResponse(route.request().url()));}catch{/* Cancellation can close this response first. */}
 });
 try{
  await page.goto('/');await expect(page.getByRole('heading',{name:old.name,exact:true})).toBeVisible();
  await tab(page,'seguridad');await expect(region(page)).toHaveAttribute('aria-busy','false');
  await update(page).click();await expect.poll(()=>requests).toBe(2);
  await tab(page,'viaje');
  await page.getByLabel('Origen',{exact:true}).fill('40, -3.7');
  await page.getByLabel('Destino 1',{exact:true}).fill('40.3, -3.7');
  await page.getByRole('button',{name:'Calcular ruta',exact:true}).click();
  await expect.poll(()=>roadStarted).toBe(true);
  await expect(page.getByRole('button',{name:'Cancelar cálculo',exact:true})).toBeVisible();
  nationalGate.release();
  await tab(page,'seguridad');
  await expect(update(page)).toBeDisabled();
  await expect(region(page)).toHaveAttribute('aria-busy','true');
  await expect(region(page)).toContainText('se aplicará al finalizar el cálculo');
  await tab(page,'mapa');await expect(page.getByRole('heading',{name:old.name,exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:fresh.name,exact:true})).toHaveCount(0);
  await tab(page,'viaje');await page.getByRole('button',{name:'Cancelar cálculo',exact:true}).click();
  roadGate.release();
  await tab(page,'mapa');await expect(page.getByRole('heading',{name:fresh.name,exact:true})).toBeVisible();
 }finally{nationalGate.release();roadGate.release();}
});

test('automatic visibility checks do not fetch every minute and refresh after an hour',async({page})=>{
 let requests=0,version=1;
 await page.clock.install({time:new Date('2026-11-16T12:00:00Z')});
 await page.route('**/data/chargers-spain.json*',route=>{requests++;return json(route,publication(version));});
 await page.goto('/');await expect(page.getByRole('heading',{name:old.name,exact:true})).toBeVisible();
 await tab(page,'seguridad');await expect(region(page)).toHaveAttribute('aria-busy','false');
 expect(requests).toBe(1);
 await page.clock.fastForward(59*60*1000);
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 expect(requests).toBe(1);
 version=2;await page.clock.fastForward(60001);
 await expect.poll(()=>requests).toBe(2);
 await expect(region(page)).toHaveAttribute('aria-busy','false');
 await tab(page,'mapa');await expect(page.getByRole('heading',{name:fresh.name,exact:true})).toBeVisible();
});
