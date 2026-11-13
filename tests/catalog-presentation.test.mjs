import test from 'node:test';
import assert from 'node:assert/strict';
import {describeCatalog,safeExternalUrl} from '../src/catalog-presentation.mjs';

test('source links permit http(s), never executable URLs or embedded credentials',()=>{
 assert.equal(safeExternalUrl('javascript:alert(1)'),null);
 assert.equal(safeExternalUrl('data:text/html,test'),null);
 assert.equal(safeExternalUrl('https://name:secret@example.org/'),null);
 assert.equal(safeExternalUrl('https://creativecommons.org/licenses/by/4.0/'),'https://creativecommons.org/licenses/by/4.0/');
});
test('catalog summary counts countries present in data, not requested import coverage',()=>{
 const summary=describeCatalog({updated:'2026-11-13T12:00:00Z',chargers:[{id:'dgt-1',source:'DGT'},{id:'reve:one',source:'REVE'},{id:'ocm-global-FR-1',source:'Open Charge Map',country:'FR'}],internationalSource:{countriesCovered:['FR','RU','JP'],updatedAt:'2026-11-13T12:05:00Z'}},Date.parse('2026-11-13T13:00:00Z'));
 assert.match(summary,/3 puntos/);assert.match(summary,/1 registros OCM en 1 países\/territorios \(FR\)/);
 assert.doesNotMatch(summary,/\(FR, JP, RU\)/);assert.match(summary,/1 registros REVE API/);
 assert.match(summary,/cobertura parcial/);assert.match(summary,/importar no verifica precios, gratuidad ni ocupación/);
});
test('missing and future dates stay unknown, imports do not establish freshness',()=>{
 const summary=describeCatalog({chargers:[],updated:'2099-01-01',internationalSource:{updatedAt:null}},Date.parse('2026-11-13T13:00:00Z'));
 assert.match(summary,/sin registros OCM internacionales importados/);assert.match(summary,/importación nacional: fecha desconocida/);assert.match(summary,/última ejecución OCM: fecha desconocida/);
});
test('partitioned source reports available records separately from initially loaded records',()=>{
 const summary=describeCatalog({updated:'2026-11-13T12:00:00Z',chargers:[{id:'dgt',source:'DGT'}],internationalSource:{countriesCovered:['FR','RU'],stationsByCountry:{FR:100,RU:20,AD:0},updatedAt:'2026-11-13T12:00:00Z'}},Date.parse('2026-11-13T13:00:00Z'));
 assert.match(summary,/1 puntos cargados/);assert.match(summary,/120 registros OCM disponibles para cargar en 2 países\/territorios \(FR, RU\)/);
});
