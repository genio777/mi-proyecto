import test from 'node:test';
import assert from 'node:assert/strict';
import {sameCatalogData,replaceNationalCatalog,mergeCountryCatalog} from '../src/catalog-merge.mjs';

test('refreshing national data removes withdrawn records while retaining loaded international stations',()=>{
 const old=[{id:'dgt-old'},{id:'dgt-kept',price:null},{id:'ocm-global-FR-1',country:'FR'}];
 const next=[{id:'dgt-kept',price:.4},{id:'reve:new',price:null}];
 assert.deepEqual(replaceNationalCatalog(old,old.slice(0,2),next),[old[2],...next]);
 assert.equal(old[1].price,null);
});
test('a refreshed country replaces its old stations without retaining withdrawn points or removing Spanish source records',()=>{
 const old=[{id:'dgt-es',country:'ES'},{id:'ocm-global-ES-1',country:'ES'},{id:'ocm-global-FR-1',country:'FR'},{id:'local-personal',country:'ES'}];
 const next=[{id:'ocm-global-ES-2',country:'ES',price:null}];
 assert.deepEqual(mergeCountryCatalog(old,next,['ES']),[old[0],old[2],old[3],...next]);
});
test('snapshot equality detects source metadata, prices and station removals, independently of object key order',()=>{
 const a={updated:'2026-11-16',chargers:[{id:'one',price:null,connectors:[{type:'CCS',powerKw:350}]}]};
 assert.equal(sameCatalogData(a,JSON.parse(JSON.stringify(a))),true);
 assert.equal(sameCatalogData(a,{chargers:a.chargers,updated:a.updated}),true);
 assert.equal(sameCatalogData(a,{...a,chargers:[{...a.chargers[0],price:0}]}),false);
 assert.equal(sameCatalogData(a,{...a,chargers:[]}),false);
 assert.equal(sameCatalogData(a,{...a,updated:'2026-11-17'}),false);
 assert.equal(sameCatalogData(a,null),false);
});
