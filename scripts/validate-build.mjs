import fs from 'node:fs';
import assert from 'node:assert/strict';
import {validPersistedOcm} from './lib/ocm.mjs';
const read = name => JSON.parse(fs.readFileSync(name, 'utf8'));
const manifest = read('dist/manifest.webmanifest');
assert.equal(manifest.name, 'Carga Gratis España Jpaz');
assert.equal(manifest.display, 'standalone');
assert(manifest.start_url && manifest.scope);
const html = fs.readFileSync('dist/index.html', 'utf8');
assert(html.includes('Carga Gratis España Jpaz'));
assert(!html.includes('src/main.tsx'), 'El HTML debe estar compilado');
assert(fs.readdirSync('dist/assets').some(name => name.endsWith('.js')));
assert(fs.existsSync('dist/sw.js'));
const catalog = read('dist/data/chargers-spain.json');
assert(catalog.chargers.length >= 5000, 'Falta catálogo nacional');
const ids = new Set();
for (const station of catalog.chargers) {
  assert(station.id && !ids.has(station.id), 'ID ausente o duplicado: ' + station.id);
  ids.add(station.id);
  assert(station.source && Number.isFinite(station.lat) && Math.abs(station.lat) <= 90);
  assert(Number.isFinite(station.lng) && Math.abs(station.lng) <= 180);
  assert(Number.isFinite(station.power) && station.power > 0);
  assert(station.price === null || (Number.isFinite(station.price) && station.price >= 0));
}
const manifestPath = 'dist/data/international/index.json';
let international = 0;
assert(fs.existsSync(manifestPath), 'Falta índice de cobertura internacional');
if (fs.existsSync(manifestPath)) {
  const index = read(manifestPath);
  assert.equal(index.schemaVersion, 1);
  for (const country of index.countries) {
    assert.match(country.code, /^[A-Z]{2}$/);
    assert.equal(country.file, country.code + '.json');
    const part = read('dist/data/international/' + country.file);
    assert.equal(part.country, country.code);
    assert.equal(part.chargers.length, country.count);
    for (const station of part.chargers) {
      assert(validPersistedOcm(station), 'Faltan licencia o tomas verificables: ' + station.id);
      assert.equal(station.country, country.code);
      assert(!ids.has(station.id), 'ID internacional duplicado: ' + station.id);
      ids.add(station.id);
      assert(station.price === null || (Number.isFinite(station.price) && station.price >= 0));
      if (station.price !== null) assert(station.priceSource && station.priceVerifiedAt);
      international++;
    }
  }
}
console.log('Compilación validada: PWA, recursos,', catalog.chargers.length, 'estaciones nacionales y', international, 'internacionales');
