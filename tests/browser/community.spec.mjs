import {test,expect} from '@playwright/test';
const proposal={name:'Fixture comunitaria válida',address:'Madrid',instructions:'Información de prueba sin verificar',lat:40.4,lng:-3.7,power_kw:22,connector:'Tipo2'};
const issue=(number,point)=>({number,state:'open',body:'<!-- CARGAGRATIS_POINT\n'+JSON.stringify(point)+'\n-->',html_url:'javascript:invalid',reactions:{'+1':0,'-1':0}});
const json=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});

test.beforeEach(async({page})=>{
 await page.route('**/data/chargers-spain.json*',route=>json(route,{chargers:[{id:'fixture',name:'Fixture Madrid',city:'Madrid',lat:40.4,lng:-3.7,power:22,connector:'Tipo2',price:null,source:'Browser fixture'}]}));
 await page.route('**/data/operator-tariffs.json*',route=>json(route,{operators:[]}));
 await page.route('**/data/international/index.json*',route=>json(route,{schemaVersion:1,countries:[]}));
 await page.route('**/tile.openstreetmap.org/**',route=>route.abort());
});

test('invalid community fields cannot crash navigation or change source links',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://api.github.com/repos/genio777/mi-proyecto/issues*',route=>json(route,[issue(1,{...proposal,name:{nested:'not text'}}),issue(2,proposal),issue(3,{...proposal,instructions:[]})]));
 await page.goto('/');
 await page.locator('nav').getByRole('button',{name:'añadir gratis',exact:true}).click();
 const card=page.locator('article').filter({has:page.getByRole('heading',{name:proposal.name,exact:true})});
 await expect(card).toBeVisible();
 await expect(card.getByRole('link',{name:/Confirmar/})).toHaveAttribute('href','https://github.com/genio777/mi-proyecto/issues/2');
 await expect(card).toContainText('Pendiente de confirmación');
 await page.locator('nav').getByRole('button',{name:'seguridad',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Seguridad y privacidad',exact:true})).toBeVisible();
 await expect(page.getByText('Buscar una dirección envía el texto al servicio Photon.',{exact:false})).toBeVisible();
 expect(errors).toEqual([]);
});

test('community requests recover from a provider error and clear the old message',async({page})=>{
 let attempts=0;
 await page.route('https://api.github.com/repos/genio777/mi-proyecto/issues*',route=>++attempts===1?json(route,{message:'Fixture unavailable'},503):json(route,[issue(2,proposal)]));
 await page.goto('/');
 await page.locator('nav').getByRole('button',{name:'añadir gratis',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('GitHub 503');
 await page.getByRole('button',{name:'Actualizar aportaciones',exact:true}).click();
 await expect(page.getByRole('heading',{name:proposal.name,exact:true})).toBeVisible();
 await expect(page.getByRole('status')).toHaveCount(0);
});
