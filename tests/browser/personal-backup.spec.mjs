import fs from 'node:fs/promises';
import {test as base,expect} from '@playwright/test';

const station={id:'backup-fixture',name:'Fixture de copia',city:'Madrid',lat:40.4168,lng:-3.7038,power:22,connector:'Tipo2',connectors:[{type:'Tipo2',powerKw:22}],price:null,source:'Synthetic browser fixture',verified:'No verificada'};
const json=(route,body)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
const test=base.extend({page:async({page},use)=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/data/chargers-spain.json*',route=>json(route,{updated:'2026-11-14T10:00:00Z',chargers:[station]}));
 await page.route('**/data/operator-tariffs.json*',route=>json(route,{updated:'2026-11-14T10:00:00Z',operators:[]}));
 await page.route('**/data/international/index.json*',route=>json(route,{schemaVersion:1,countries:[]}));
 await page.route('**/tile.openstreetmap.org/**',route=>route.abort());
 await use(page);expect(errors,'Personal data never causes an uncaught browser error').toEqual([]);
}});
async function load(page,settings={},denyWrites=false){
 await page.addInitScript(({settings,denyWrites})=>{
  for(const [key,value]of Object.entries(settings))localStorage.setItem(key,value);
  if(denyWrites)Storage.prototype.setItem=function(){throw new DOMException('Storage unavailable','QuotaExceededError');};
 },{settings,denyWrites});
 await page.goto('/');await expect(page.getByRole('heading',{name:'Fixture de copia',exact:true})).toBeVisible();
}
const tab=(page,name)=>page.locator('nav').getByRole('button',{name,exact:true}).click();
const copy=settings=>({format:'cargagratis-personal-data',version:1,createdAt:'2026-11-14T10:00:00.000Z',settings});
const upload=(page,document)=>page.getByLabel('Seleccionar copia JSON',{exact:true}).setInputFiles({name:'copia.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(document))});

test('a downloadable JSON protects saved profiles and favorites without caches or credentials',async({page})=>{
 await load(page,{cg_favorites:JSON.stringify(['backup-fixture']),cg_vehicle_profiles_v2:JSON.stringify({'Tesla Model Y Standard Range':{battery:58,consumption:18,maxCharge:160,maxAc:11},'Renault Zoe R90':{battery:40,consumption:16,maxCharge:0,maxAc:22}}),cg_geo_photon_v1_private:'private address',REVE_API_KEY:'synthetic-secret-never-export',cg_unknown_rate:'0'});
 await tab(page,'seguridad');
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar copia JSON',exact:true}).click();
 const download=await downloaded,body=await fs.readFile(await download.path(),'utf8'),document=JSON.parse(body);
 expect(download.suggestedFilename()).toMatch(/^cargagratis-copia-\d{4}-\d{2}-\d{2}\.json$/);
 expect(document.format).toBe('cargagratis-personal-data');expect(document.settings.cg_favorites).toEqual(['backup-fixture']);
 expect(document.settings.cg_vehicle_profiles_v2['Renault Zoe R90'].battery).toBe(40);
 expect(document.settings.cg_unknown_rate).toBe(0);expect(body).not.toContain('private address');expect(body).not.toContain('synthetic-secret-never-export');
 // The actual downloaded bytes can be selected again by the app's file picker.
 await page.getByLabel('Seleccionar copia JSON',{exact:true}).setInputFiles({name:download.suggestedFilename(),mimeType:'application/json',buffer:Buffer.from(body)});
 await expect(page.getByRole('heading',{name:'Revisar copia',exact:true})).toBeVisible();
});

test('restoration is voluntary and recovers both vehicle profiles, favorites and the saved simulation',async({page})=>{
 await load(page);
 const settings={cg_favorites:['backup-fixture'],cg_vehicle_name:'Renault Zoe R90',cg_vehicle_profiles_v2:{'Tesla Model Y Standard Range':{battery:58,consumption:18,maxCharge:160,maxAc:11},'Renault Zoe R90':{battery:40,consumption:16,maxCharge:0,maxAc:22}},cg_connectors:['Tipo2'],cg_vehicle_connectors:{'Renault Zoe R90':['Tipo2']},cg_soc:35,cg_reserve:12,cg_unknown_rate:0,cg_tesla_rate:0,cg_cost_simulator_v1:{costKwh:45,costFixed:2,costMinutes:20,costPerMinute:.03,costSort:'desc',costSearch:'',costVerifiedOnly:false}};
 await tab(page,'seguridad');await upload(page,copy(settings));
 await expect(page.getByRole('heading',{name:'Revisar copia',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('cg_favorites')))).toEqual([]);
 await page.getByRole('button',{name:'Restaurar esta copia',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Fixture de copia',exact:true})).toBeVisible();
 await tab(page,'favoritos');await expect(page.getByRole('heading',{name:'Fixture de copia',exact:true})).toBeVisible();
 await tab(page,'vehículo');await expect(page.getByLabel('Batería útil (kWh)',{exact:true})).toHaveValue('40');
 await page.getByRole('button',{name:'Tesla Model Y Standard Range',exact:true}).click();await expect(page.getByLabel('Batería útil (kWh)',{exact:true})).toHaveValue('58');
 await tab(page,'viaje');await expect(page.getByLabel('SOC salida (%)',{exact:true})).toHaveValue('35');
 await expect(page.getByLabel('Reserva mínima (%)',{exact:true})).toHaveValue('12');
 await tab(page,'costes');page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Recuperar simulación',exact:true}).click();
 await expect(page.getByLabel('Energía (kWh)',{exact:true})).toHaveValue('45');
 await expect(page.getByLabel('Coste fijo por sesión (€)',{exact:true})).toHaveValue('2');
 await expect(page.getByLabel('Orden de coste',{exact:false})).toHaveValue('desc');
});

test('invalid imports do not change saved data or offer restoration',async({page})=>{
 await load(page,{cg_favorites:JSON.stringify(['backup-fixture'])});await tab(page,'seguridad');
 await upload(page,copy({cg_favorites:['new-fixture'],cg_soc:200}));
 await expect(page.getByRole('status').filter({hasText:'no válidos'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Restaurar esta copia',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('cg_favorites')))).toEqual(['backup-fixture']);
});

test('malformed saved arrays and profiles cannot prevent startup or vehicle selection',async({page})=>{
 await load(page,{cg_favorites:'null',cg_local_free_chargers:'{}',cg_selected_operators:'{}',cg_vehicle_profiles_v2:'null',cg_vehicle_connectors:'null',cg_soc:'"invalid"'});
 await tab(page,'favoritos');await expect(page.getByText('0 cargadores guardados',{exact:true})).toBeVisible();
 await tab(page,'vehículo');await expect(page.getByLabel('Batería útil (kWh)',{exact:true})).toHaveValue('57.5');
 await page.getByRole('button',{name:'Renault Zoe R90',exact:true}).click();await expect(page.getByLabel('Potencia máxima AC del vehículo (kW)',{exact:false})).toHaveValue('22');
 await tab(page,'viaje');await expect(page.getByLabel('SOC salida (%)',{exact:true})).toHaveValue('90');
});

test('denied writes show a notice and leave map and favorites usable',async({page})=>{
 await load(page,{},true);
 await expect(page.getByRole('status').filter({hasText:'No se pudieron guardar los cambios'})).toBeVisible();
 await page.getByRole('button',{name:'☆ Favorito',exact:true}).click();
 await expect(page.getByRole('button',{name:'★ Guardado',exact:true})).toBeVisible();
 await tab(page,'favoritos');await expect(page.getByRole('heading',{name:'Fixture de copia',exact:true})).toBeVisible();
});
