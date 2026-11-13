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

const reveNow=Date.parse('2027-11-01T13:00:00Z');
const withReve=(status,extra={})=>({
 updated:'2027-11-01T12:00:00Z',
 chargers:[{id:'dgt-1',source:'DGT MITERD'},{id:'reve:one',source:'REVE'}],
 internationalSource:{stationsByCountry:{FR:100,RU:20},updatedAt:'2027-11-01T12:00:00Z'},
 reveApi:{status,lastSuccess:'2027-10-28T10:00:00Z',...extra}
});

test('expired REVE credential shows the blocker, cached count and last success without losing DGT/OCM context',()=>{
 const summary=describeCatalog(withReve('credential_expired',{credentialExpiresOn:'2027-10-29',credentialExpiresAt:'2027-10-29T22:00:00.000Z',credentialTimezone:'Europe/Madrid'}),reveNow);
 assert.match(summary,/REVE API: credencial caducada; sincronización detenida/);
 assert.match(summary,/1 registros REVE API en caché de inventario/);
 assert.match(summary,/última importación REVE correcta: 28\/10\/2027, 12:00:00/);
 assert.match(summary,/fecha de caducidad configurada: 29\/10\/2027 inclusive/);
 assert.match(summary,/fuentes nacionales de España/);assert.match(summary,/120 registros OCM disponibles/);
 assert.match(summary,/importar no verifica precios, gratuidad ni ocupación/);
});

test('invalid expiry, unauthorized and unconfigured REVE statuses remain distinct',()=>{
 const scenarios=[['credential_expiry_invalid',/fecha de caducidad de la credencial no válida; sincronización detenida/],['unauthorized',/acceso no autorizado; sincronización detenida/],['not_configured',/sin credencial configurada; sincronización pendiente/]];
 for(const [status,message]of scenarios){
  const summary=describeCatalog(withReve(status),reveNow);
  assert.match(summary,message);assert.match(summary,/última importación REVE correcta/);assert.match(summary,/1 registros REVE API en caché/);
 }
});

test('no REVE cache or prior successful date is described as pending, not as live coverage',()=>{
 const catalog=withReve('not_configured',{lastSuccess:null,records:999});catalog.chargers=[{id:'dgt-1',source:'DGT'}];
 const summary=describeCatalog(catalog,reveNow);
 assert.match(summary,/sin credencial configurada; sincronización pendiente/);assert.match(summary,/0 registros REVE API en catálogo/);
 assert.match(summary,/sin fecha de importación REVE correcta confirmada/);assert.doesNotMatch(summary,/999|tiempo real|plazas libres/);
});

test('future success dates, invalid expiration dates and unknown metadata are never presented as verified values',()=>{
 const summary=describeCatalog(withReve('untrusted-status-value',{lastSuccess:'2099-01-01T00:00:00Z',credentialExpiresOn:'2027-02-30',credentialExpiresAt:'untrusted-value',apiKey:'synthetic-private-value'}),reveNow);
 assert.match(summary,/estado de sincronización no indicado/);assert.match(summary,/sin fecha de importación REVE correcta confirmada/);
 assert.doesNotMatch(summary,/2099|30\/2\/2027|2\/3\/2027|untrusted|synthetic-private/);
});

test('successful static REVE import does not imply current prices or availability',()=>{
 const summary=describeCatalog(withReve('synced'),reveNow);
 assert.match(summary,/inventario sincronizado según la última ejecución/);assert.match(summary,/en caché de inventario/);
 assert.match(summary,/importar no verifica precios, gratuidad ni ocupación/);
});

test('unknown states cannot resolve inherited object properties',()=>{
 for(const status of ['__proto__','constructor','toString'])assert.match(describeCatalog(withReve(status),reveNow),/estado de sincronización no indicado/);
});
