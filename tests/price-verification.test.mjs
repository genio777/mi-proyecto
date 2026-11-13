import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('../scripts/merge-verified-prices.mjs',import.meta.url));
const connectorId='ES*TEST*E1*1';
function fixtures(price=.42){
 const station={id:'station-1',name:'Fixture station',operator:'Fixture operator',city:'Madrid',lat:40.4,lng:-3.7,power:150,connector:'CCS',connectors:[{type:'CCS',powerKw:150,officialConnectorId:connectorId,price:null}],price:null};
 const row={id:station.id,sourceUrl:'https://operator.example/tariffs/ES-TEST-E1-1',checkedAt:new Date().toISOString(),price,unit:'EUR/kWh',hasExtraFees:false,taxIncluded:true,priceBasis:'ad_hoc',tariffElements:[{type:'ENERGY',price,currency:'EUR',restrictions:null}],requiresPurchase:false,timeLimitMinutes:null,membershipRequired:false,publicAccess:true,stationEvidence:'Fixture operator identifies connector '+connectorId+' at this site.',conditions:'Public pay-as-you-go; energy only; taxes included.',lat:station.lat,lng:station.lng,connectorId,connectorType:'CCS',powerKw:150};
 const unknown={...structuredClone(station),id:'station-unknown',name:'Unknown price station',connectors:[{...station.connectors[0],officialConnectorId:'ES*TEST*E2*1'}]};
 return {catalog:{chargers:[station,unknown]},overlay:{prices:[row]}};
}
async function execute(input,verify){
 const dir=await mkdtemp(join(tmpdir(),'cargagratis-price-test-'));
 try{
  await mkdir(join(dir,'public/data'),{recursive:true});
  await mkdir(join(dir,'data'),{recursive:true});
  const original=JSON.stringify(input.catalog);
  const catalogPath=join(dir,'public/data/chargers-spain.json');
  await writeFile(catalogPath,original);
  await writeFile(join(dir,'data/verified-station-prices.json'),JSON.stringify(input.overlay));
  const result=spawnSync(process.execPath,[script],{cwd:dir,encoding:'utf8'});
  await verify({result,dir,catalogPath,original});
 }finally{await rm(dir,{recursive:true,force:true})}
}
async function rejectFixture(input,message){
 await execute(input,async({result,catalogPath,original})=>{
  assert.notEqual(result.status,0,'Invalid tariff was accepted');
  assert.match(result.stderr,message);
  assert.equal(await readFile(catalogPath,'utf8'),original,'A rejected overlay must not change the published catalogue');
 });
}

test('a current final connector tariff applies while an unknown price remains unknown',async()=>{
 await execute(fixtures(),async({result,catalogPath,dir})=>{
  assert.equal(result.status,0,result.stderr);
  const catalog=JSON.parse(await readFile(catalogPath,'utf8'));
  assert.equal(catalog.chargers[0].price,.42);
  assert.equal(catalog.chargers[0].connectors[0].price,.42);
  assert.equal(catalog.chargers[1].price,null);
  assert.equal(catalog.chargers[1].connectors[0].price,null);
  const report=JSON.parse(await readFile(join(dir,'public/data/price-verification-status.json'),'utf8'));
  assert.equal(report.appliedVerifiedStationPrices,1);
  assert.equal(report.verifiedFreeStations,0);
  assert.equal(report.stationsWithUnknownPrice,1);
 });
});

test('zero is accepted only with evidence of unrestricted public charging',async()=>{
 await execute(fixtures(0),async({result,catalogPath,dir})=>{
  assert.equal(result.status,0,result.stderr);
  const catalog=JSON.parse(await readFile(catalogPath,'utf8'));
  assert.equal(catalog.chargers[0].price,0);
  assert.equal(catalog.chargers[1].price,null);
  const report=JSON.parse(await readFile(join(dir,'public/data/price-verification-status.json'),'utf8'));
  assert.equal(report.verifiedFreeStations,1);
 });
});

for(const [label,changes] of [
 ['purchase requirement',{requiresPurchase:true}],
 ['time limit',{timeLimitMinutes:30}],
 ['membership requirement',{membershipRequired:true}],
 ['private access',{publicAccess:false}],
 ['unconfirmed public access',{publicAccess:undefined}]
]){
 test('rejects purported free charging with '+label,async()=>{
  const input=fixtures(0);Object.assign(input.overlay.prices[0],changes);
  await rejectFixture(input,/Conditional free tariff/);
 });
}

for(const [label,changes,error] of [
 ['expired evidence',{checkedAt:new Date(Date.now()-8*86400000).toISOString()},/Tariff expired/],
 ['future evidence',{checkedAt:new Date(Date.now()+86400000).toISOString()},/Tariff expired/],
 ['missing source URL',{sourceUrl:''},/Unverified tariff/],
 ['insecure source URL',{sourceUrl:'http://operator.example/tariff'},/Unverified tariff/],
 ['missing verification date',{checkedAt:''},/Unverified tariff/],
 ['price without VAT',{taxIncluded:false},/include taxes/],
 ['unconfirmed extra fees',{hasExtraFees:null},/Additional fees/],
 ['subscription tariff',{priceBasis:'subscription'},/pay-as-you-go/],
 ['missing station evidence',{stationEvidence:''},/station-specific evidence/],
 ['wrong connector identity',{connectorId:'ES*TEST*E9*9',stationEvidence:'Evidence for ES*TEST*E9*9 at another connector'},/No unique official connector/],
 ['different station coordinates',{lat:41.4},/coordinates do not match/]
]){
 test('rejects '+label+' without publishing a price',async()=>{
  const input=fixtures();Object.assign(input.overlay.prices[0],changes);
  await rejectFixture(input,error);
 });
}

test('energy plus a session fee cannot be represented by one EUR/kWh price',async()=>{
 const input=fixtures();input.overlay.prices[0].tariffElements.push({type:'FLAT',price:1,currency:'EUR'});
 await rejectFixture(input,/exactly one unconditional energy element/);
});

test('an energy tariff with time or power restrictions cannot become an unconditional price',async()=>{
 const input=fixtures();input.overlay.prices[0].tariffElements[0].restrictions={start_time:'22:00',end_time:'06:00'};
 await rejectFixture(input,/Conditional or multi-component tariff/);
});

test('one verified socket price cannot be assigned to every socket at a multi-connector site',async()=>{
 const input=fixtures();input.catalog.chargers[0].connectors.push({type:'CCS',powerKw:150,officialConnectorId:'ES*TEST*E1*2',price:null});
 await rejectFixture(input,/Multi-connector station/);
});

test('a later invalid row prevents publication of earlier valid rows too',async()=>{
 const input=fixtures();input.overlay.prices.push({...input.overlay.prices[0],id:'station-unknown',checkedAt:'not-a-date'});
 await rejectFixture(input,/Unverified tariff/);
});
