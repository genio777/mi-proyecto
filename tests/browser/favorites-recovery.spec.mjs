import {test as base,expect} from '@playwright/test';
const countryStation=(code,id,name,lat,lng)=>({id,name,city:code==='RU'?'Москва':'Madrid',country:code,lat,lng,power:22,connector:'Tipo2',connectors:[{type:'Tipo2',powerKw:22}],price:null,source:'Synthetic browser fixture',verified:'No verificada',sourceUrl:'https://openchargemap.org/site/poi/details/1',dataProvider:{name:'Open Charge Map Contributors',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/'}});
const national=countryStation('ES','national-fixture','Fixture España',40.4168,-3.7038),russian=countryStation('RU','ocm-global-RU-123','Fixture Moscú guardada',55.75,37.61);
const json=(route,body)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
const test=base.extend({page:async({page},use)=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/data/chargers-spain.json*',route=>json(route,{updated:'2026-11-14T10:00:00Z',chargers:[national]}));
 await page.route('**/data/operator-tariffs.json*',route=>json(route,{updated:'2026-11-14T10:00:00Z',operators:[]}));
 await page.route('**/data/international/index.json*',route=>json(route,{schemaVersion:1,countries:[{code:'RU',file:'RU.json',count:1,bbox:[37,55,38,56]},{code:'FR',file:'FR.json',count:1,bbox:[2,48,3,49]}]}));
 await page.route('**/tile.openstreetmap.org/**',route=>route.abort());
 await use(page);expect(errors,'Restoring favourites causes no uncaught browser errors').toEqual([]);
}});
const tab=(page,name)=>page.locator('nav').getByRole('button',{name,exact:true}).click();

test('personal favourites remain visible while unknown saved IDs remain removable',async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem('cg_local_free_chargers',JSON.stringify([{id:'local-backup-fixture',name:'Mi punto personal',city:'Madrid',address:'Instrucciones privadas',lat:40.4168,lng:-3.7038,power:22,connector:'Tipo2',price:null,source:'Aportación personal sin verificar',verified:'Pendiente de verificación'}]));
  localStorage.setItem('cg_favorites',JSON.stringify(['local-backup-fixture','missing-legacy-id']));
 });
 await page.goto('/');await tab(page,'favoritos');
 const personal=page.locator('article').filter({has:page.getByRole('heading',{name:'Mi punto personal',exact:true})});
 await expect(personal).toBeVisible();await expect(personal).toContainText('Aportación personal sin verificar');
 await expect(personal.getByText('Desconocido',{exact:true})).toBeVisible();await expect(personal).not.toContainText('Gratis confirmado');
 const missing=page.locator('article').filter({hasText:'missing-legacy-id'});
 await expect(missing.getByRole('heading',{name:'Ficha pendiente',exact:true})).toBeVisible();
 await expect(missing.getByRole('button',{name:'Navegar',exact:true})).toHaveCount(0);
 await missing.getByRole('button',{name:'Quitar favorito',exact:true}).click();
 await expect(page.getByText('1 cargadores guardados',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('cg_favorites')))).toEqual(['local-backup-fixture']);
});

test('an international station saved on the map recovers its licensed country record after reload',async({page})=>{
 const countryRequests=[];
 await page.route('**/data/international/RU.json*',route=>{countryRequests.push('RU');return json(route,{country:'RU',chargers:[russian]});});
 await page.route('**/data/international/FR.json*',route=>{countryRequests.push('FR');return json(route,{country:'FR',chargers:[countryStation('FR','ocm-global-FR-456','Fixture Francia',48.5,2.5)]});});
 await page.goto('/');await expect(page.getByRole('heading',{name:'Fixture España',exact:true})).toBeVisible();
 await page.getByLabel('Buscar cargadores',{exact:true}).fill('55.75, 37.61');await page.getByRole('button',{name:'Buscar zona',exact:true}).click();
 const card=page.locator('.cards article').filter({has:page.getByRole('heading',{name:'Fixture Moscú guardada',exact:true})});
 await expect(card).toBeVisible();await card.getByRole('button',{name:'☆ Favorito',exact:true}).click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('cg_favorites')))).toEqual(['ocm-global-RU-123']);
 await page.reload();await expect(page.getByRole('heading',{name:'Fixture España',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Fixture Moscú guardada',exact:true})).toHaveCount(0);
 await tab(page,'favoritos');
 const restored=page.locator('article').filter({has:page.getByRole('heading',{name:'Fixture Moscú guardada',exact:true})});
 await expect(restored).toBeVisible();await expect(restored.getByRole('link',{name:'CC BY 4.0',exact:true})).toHaveAttribute('href','https://creativecommons.org/licenses/by/4.0/');
 await expect(restored.getByText('Desconocido',{exact:true})).toBeVisible();expect(countryRequests).toEqual(['RU','RU']);
});
