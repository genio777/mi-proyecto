import test from 'node:test';
import assert from 'node:assert/strict';
import {describeStationEvidence} from '../src/station-evidence.mjs';

const now=Date.parse('2026-11-13T12:00:00.000Z');
const week=7*86400000;
const iso=value=>new Date(value).toISOString();
const stationFixture=()=>({
 id:'ocm-global-FR-12345',name:'Fixture station',country:'FR',power:150,
 source:'Open Charge Map · Example Provider · FR · 12345',
 sourceUrl:'https://openchargemap.org/site/poi/details/12345',
 sourceUpdatedAt:'2026-11-10T09:30:00.000Z',importedAt:iso(now),
 dataProvider:{id:1,name:'Example Provider',url:'https://provider.example/',license:'Creative Commons Attribution 4.0 International',licenseUrl:'https://creativecommons.org/licenses/by/4.0/'},
 price:.42,priceSource:'https://operator.example/stations/12345/tariff',priceVerifiedAt:iso(now-86400000),
 availability:'Desconocida'
});
const quoteFixture=(rate=.42,source='station')=>({rate,source,total:rate*30,label:'Fixture quote'});

function assertUnknownPrice(report){
 assert.equal(report.price.status,'unknown');
 assert.equal(report.price.label,'Desconocido');
 assert.equal(report.price.rate,null);
 assert.ok(typeof report.price.reason==='string'&&report.price.reason.trim());
}

test('a matching current individual tariff is confirmed with its own evidence',()=>{
 const station=stationFixture();
 const result=describeStationEvidence(station,quoteFixture(),now);
 assert.equal(result.price.status,'confirmed');
 assert.equal(result.price.label,'Confirmado');
 assert.equal(result.price.rate,.42);
 assert.equal(result.price.verifiedAt,station.priceVerifiedAt);
 assert.equal(result.price.sourceUrl,station.priceSource);
});

test('zero is confirmed only by the same evidence required for a positive tariff',()=>{
 const station={...stationFixture(),price:0};
 const confirmed=describeStationEvidence(station,quoteFixture(0),now);
 assert.equal(confirmed.price.status,'confirmed');
 assert.equal(confirmed.price.rate,0);
 const withoutEvidence=describeStationEvidence({...station,priceVerifiedAt:null,priceSource:null},quoteFixture(0),now);
 assert.equal(withoutEvidence.price.status,'estimated');
 assert.equal(withoutEvidence.price.label,'Estimado');
});

for(const source of ['reference','manual']){
 test(source+' prices remain estimates even when their number matches a verified tariff',()=>{
  const report=describeStationEvidence(stationFixture(),quoteFixture(.42,source),now);
  assert.equal(report.price.status,'estimated');
  assert.equal(report.price.label,'Estimado');
  assert.equal(report.price.rate,.42);
  assert.equal(describeStationEvidence({...stationFixture(),price:0},quoteFixture(0,source),now).price.status,'estimated');
 });
}

for(const [name,quote] of [
 ['no quote',null],['missing rate',{source:'station'}],['not a number',quoteFixture(NaN)],
 ['infinite rate',quoteFixture(Infinity)],['negative rate',quoteFixture(-.01)],
 ['numeric text',quoteFixture('0')],['unknown origin',quoteFixture(0,'invented')],
 ['absent origin',{rate:0}]
]){
 test('unknown tariff stays unknown with '+name,()=>{
  assertUnknownPrice(describeStationEvidence({...stationFixture(),price:0,declaredUsageCost:'Free'},quote,now));
 });
}

test('a catalog declaration of free charging never creates a quote',()=>{
 const result=describeStationEvidence({...stationFixture(),price:null,priceSource:null,priceVerifiedAt:null,declaredUsageCost:'Free of charge'},null,now);
 assertUnknownPrice(result);
});

test('the tariff verification window includes exactly seven days and excludes the next millisecond',()=>{
 const boundary={...stationFixture(),priceVerifiedAt:iso(now-week)};
 assert.equal(describeStationEvidence(boundary,quoteFixture(),now).price.status,'confirmed');
 assert.equal(describeStationEvidence({...boundary,priceVerifiedAt:iso(now-week-1)},quoteFixture(),now).price.status,'estimated');
});

test('a future verification date cannot confirm a tariff',()=>{
 const result=describeStationEvidence({...stationFixture(),priceVerifiedAt:iso(now+1)},quoteFixture(),now);
 assert.equal(result.price.status,'estimated');
});

test('a quoted rate different from the station evidence cannot be confirmed',()=>{
 const result=describeStationEvidence(stationFixture(),quoteFixture(.39),now);
 assert.equal(result.price.status,'estimated');
 assert.equal(result.price.rate,.39);
});

for(const invalid of ['2026-02-29','2026-04-31','13/11/2026','November 13, 2026','not-a-date']){
 test('non-ISO or impossible price date cannot confirm a tariff: '+invalid,()=>{
  const result=describeStationEvidence({...stationFixture(),priceVerifiedAt:invalid},quoteFixture(),now);
  assert.equal(result.price.status,'estimated');
 });
}

test('OCM record and original provider retain separate names, URLs and licence attribution',()=>{
 const station=stationFixture();
 const result=describeStationEvidence(station,null,now);
 assert.equal(result.source.name,station.source);
 assert.equal(result.source.url,station.sourceUrl);
 assert.equal(result.source.providerName,station.dataProvider.name);
 assert.equal(result.source.providerUrl,station.dataProvider.url);
 assert.equal(result.source.license,station.dataProvider.license);
 assert.equal(result.source.licenseUrl,station.dataProvider.licenseUrl);
 assert.equal(result.source.updatedAt,station.sourceUpdatedAt);
});

test('source dates come from source updates and never from cache imports or verification prose',()=>{
 const station={...stationFixture(),sourceUpdatedAt:null,importedAt:iso(now),verified:iso(now),updated:iso(now),priceVerifiedAt:iso(now)};
 const result=describeStationEvidence(station,null,now);
 assert.equal(result.source.updatedAt,null);
 assert.equal(result.source.updatedLabel,'Fecha no indicada por la fuente');
});

test('REVE source update dates are shown without implying a current tariff or occupancy',()=>{
 const result=describeStationEvidence({...stationFixture(),sourceUpdatedAt:null,reveUpdated:'2026-11-11T10:00:00Z',availability:'AVAILABLE'},null,now);
 assert.equal(result.source.updatedAt,'2026-11-11T10:00:00Z');
 assertUnknownPrice(result);
 assert.equal(result.availability.label,'Sin confirmar en tiempo real');
});

test('an ISO date without time remains a date, without manufacturing a timestamp',()=>{
 const result=describeStationEvidence({...stationFixture(),sourceUpdatedAt:'2026-11-10'},null,now);
 assert.equal(result.source.updatedAt,'2026-11-10');
 assert.match(result.source.updatedLabel,/2026/);
 assert.equal(result.source.updatedLabel.includes('00:00'),false);
});

for(const sourceUpdatedAt of ['2026-02-29','2026-04-31','not-a-date',iso(now+1)]){
 test('an invalid or future source date is presented as unknown: '+sourceUpdatedAt,()=>{
  const result=describeStationEvidence({...stationFixture(),sourceUpdatedAt},null,now);
  assert.equal(result.source.updatedAt,null);
  assert.equal(result.source.updatedLabel,'Fecha no indicada por la fuente');
 });
}

for(const unsafe of ['javascript:alert(1)','data:text/html,example','file:///private/catalog','https://user:secret@provider.example/evidence']){
 test('unsafe or credential-bearing URLs never become source links: '+unsafe.split(':')[0],()=>{
  const station={...stationFixture(),sourceUrl:unsafe,priceSource:unsafe,dataProvider:{...stationFixture().dataProvider,url:unsafe,licenseUrl:unsafe}};
  const result=describeStationEvidence(station,quoteFixture(),now);
  assert.equal(result.source.url,null);
  assert.equal(result.source.providerUrl,null);
  assert.equal(result.source.licenseUrl,null);
  assert.equal(result.price.sourceUrl,null);
  assert.equal(result.price.status,'estimated');
 });
}

test('historic status text and a fresh cache import do not become real-time occupancy',()=>{
 const baseline=describeStationEvidence(stationFixture(),null,now).availability;
 assert.equal(baseline.label,'Sin confirmar en tiempo real');
 assert.ok(typeof baseline.detail==='string'&&baseline.detail.trim());
 for(const declared of ['AVAILABLE','CHARGING','Libre','Ocupada','5/5 libres']){
  const result=describeStationEvidence({...stationFixture(),availability:declared,availabilityUpdatedAt:iso(now),importedAt:iso(now)},null,now);
  assert.deepEqual(result.availability,baseline);
 }
});

test('missing evidence has explicit unknown labels without fabricated sources',()=>{
 const result=describeStationEvidence({},null,now);
 assertUnknownPrice(result);
 assert.equal(result.source.name,'Fuente no indicada');
 assert.equal(result.source.url,null);
 assert.equal(result.source.updatedAt,null);
 assert.equal(result.source.updatedLabel,'Fecha no indicada por la fuente');
 assert.equal(result.availability.label,'Sin confirmar en tiempo real');
});


test('source links containing credential parameters cannot confirm a tariff or expose credentials',()=>{
 const now=Date.parse('2026-11-13T12:00:00Z');
 for(const priceSource of ['https://operator.example/tariff?api_key=synthetic-value','https://operator.example/tariff#access_token=synthetic-value','https://operator.example/#/tariff?token=synthetic-value']){
  const evidence=describeStationEvidence({price:.3,priceSource,priceVerifiedAt:'2026-11-13T10:00:00Z',sourceUrl:priceSource,dataProvider:{url:priceSource,licenseUrl:priceSource}}, {source:'station',rate:.3},now);
  assert.equal(evidence.price.status,'estimated');assert.equal(evidence.price.sourceUrl,null);assert.equal(evidence.source.url,null);assert.equal(evidence.source.providerUrl,null);assert.equal(evidence.source.licenseUrl,null);
  assert(!JSON.stringify(evidence).includes('synthetic-value'));
 }
});
