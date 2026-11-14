import {test as base,expect} from '@playwright/test';
import {routeResponse} from './helpers/osrm.mjs';

// These records and road responses are synthetic browser fixtures, never app data.
const stations=[
 {id:'trip-state-mixed',name:'Fixture mixed route state',city:'Fixture corridor',country:'ES',lat:40.45,lng:-3.7,
  power:350,connector:'CCS,Tipo2',connectors:[{type:'CCS',powerKw:350},{type:'Tipo2',powerKw:22}],price:null,
  operator:'Wenea',source:'Synthetic browser fixture',verified:'No verificada',availability:'Desconocida'},
 {id:'trip-state-hpc',name:'Fixture remote HPC',city:'Outside fixture corridor',country:'ES',lat:40.45,lng:1.3,
  power:350,connector:'CCS',connectors:[{type:'CCS',powerKw:350}],price:null,
  operator:'Fixture network',source:'Synthetic browser fixture',verified:'No verificada',availability:'Desconocida'},
];
const json=(route,body)=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
const tab=(page,name)=>page.locator('nav').getByRole('button',{name,exact:true}).click();
const calculate=page=>page.getByRole('button',{name:'Calcular ruta',exact:true});
const summary=page=>page.getByLabel('Resumen visual del viaje',{exact:true});

const test=base.extend({
 page:async({page},use)=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/data/chargers-spain.json*',route=>json(route,{updated:'2026-11-14T00:00:00Z',chargers:stations}));
  await page.route('**/data/operator-tariffs.json*',route=>json(route,{updated:'2026-11-14T00:00:00Z',operators:[]}));
  await page.route('**/data/international/index.json*',route=>json(route,{schemaVersion:1,countries:[]}));
  await page.route('https://router.project-osrm.org/**',route=>json(route,routeResponse(route.request().url())));
  await page.route('**/tile.openstreetmap.org/**',route=>route.fulfill({contentType:'image/png',
   body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')}));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:stations[0].name,exact:true})).toBeVisible();
  await use(page);
  expect(errors,'trip edits and recalculation cause no uncaught browser errors').toEqual([]);
 },
});

async function enterTrip(page,mode='Más rápido'){
 await tab(page,'viaje');
 await page.getByRole('button',{name:mode,exact:true}).click();
 await page.getByLabel('Origen',{exact:true}).fill('40, -3.7');
 await page.getByLabel('Destino 1',{exact:true}).fill('41.35, -3.7');
 await page.getByLabel('SOC salida (%)',{exact:true}).fill('40');
 await page.getByLabel('Reserva mínima (%)',{exact:true}).fill('15');
}
async function completeTrip(page){
 await calculate(page).click();
 await expect(summary(page)).toBeVisible({timeout:15000});
 await expect(page.locator('.routeStopCard')).toHaveCount(1);
 await expect(page.locator('.routeMapWrap #map')).toBeVisible();
 await expect(calculate(page)).toBeEnabled();
}
async function expectRecalculationRequired(page){
 await expect(summary(page)).toHaveCount(0);
 await expect(page.locator('.routeStopCard')).toHaveCount(0);
 await expect(page.locator('.routeMapWrap')).toHaveCount(0);
 await expect(page.locator('.routeResult')).toContainText(/vuelve a calcular|recalcula/i);
 await expect(calculate(page)).toBeEnabled();
}

test('editing SOC after success clears the old battery result and permits a fresh calculation',async({page})=>{
 await enterTrip(page);
 await completeTrip(page);
 await page.getByLabel('SOC salida (%)',{exact:true}).fill('50');
 await expectRecalculationRequired(page);
 await completeTrip(page);
 await expect(page.getByLabel('SOC salida (%)',{exact:true})).toHaveValue('50');
});

test('switching from Tesla to Zoe removes the Tesla plan before calculating the AC itinerary',async({page})=>{
 await enterTrip(page);
 await completeTrip(page);
 await expect(page.locator('.routeStopCard')).toContainText('170 kW compatibles · toma CCS');
 await tab(page,'vehículo');
 await page.getByRole('button',{name:'Renault Zoe R90',exact:true}).click();
 await tab(page,'viaje');
 await expectRecalculationRequired(page);
 await page.getByRole('button',{name:'Menor coste',exact:true}).click();
 await completeTrip(page);
 await expect(page.locator('.routeStopCard')).toContainText('22 kW compatibles · toma Tipo2');
 await expect(page.locator('.routeResult')).toContainText('MENOR COSTE');
});

test('changing a manual tariff removes the old unknown price until the user recalculates',async({page})=>{
 await enterTrip(page);
 await completeTrip(page);
 await expect(page.locator('.routeStopCard .evidenceBadge')).toHaveText('Desconocido');
 await page.getByLabel('Precio estimado para cargadores sin tarifa publicada (€/kWh)',{exact:true}).fill('0.45');
 await expectRecalculationRequired(page);
 await completeTrip(page);
 await expect(page.locator('.routeStopCard .evidenceBadge')).toHaveText('Estimado');
 await expect(page.locator('.routeStopCard .evidenceRate')).toContainText('0,45 €/kWh');
});

test('the mixed station ceiling, AC tariff, stop card and map popup describe the same chosen socket',async({page})=>{
 await page.route('**/data/operator-tariffs.json*',route=>json(route,{updated:'2026-11-14T00:00:00Z',operators:[
  {id:'wenea',name:'Fixture Wenea',status:'unverified',tiers:[{label:'AC 7,4–22 kW',price:.3},{label:'HPC 151–400 kW',price:.9}]},
 ]}));
 await page.reload();
 await expect(page.getByRole('heading',{name:stations[0].name,exact:true})).toBeVisible();
 await enterTrip(page,'Menor coste');
 await page.locator('.powerSelector select').selectOption('50');
 await expect(page.locator('.powerSelector')).toContainText('1 estaciones compatibles');
 await completeTrip(page);
 await expect(page.locator('.routeStopCard')).toContainText('11 kW compatibles · toma Tipo2');
 await expect(page.locator('.routeStopCard .evidenceBadge')).toHaveText('Estimado');
 await expect(page.locator('.routeStopCard .evidenceRate')).toContainText('0,30 €/kWh');
 await page.locator('.route-stop-pin').click();
 await expect(page.locator('.leaflet-popup-content')).toContainText(/11\s*kW\s+compatibles/);
 await expect(page.locator('.leaflet-popup-content')).toContainText(/Tipo\s?2/);
});
