// Restore the last published snapshot before optional network refreshes.
// A failed upstream must never turn a working build into an empty catalog.
import fs from 'node:fs';
fs.mkdirSync('public/data', {recursive:true});
for (const name of ['chargers-spain.json', 'reve-cache.json', 'operator-tariffs.json']) {
  const source = `data/${name}`, target = `public/data/${name}`;
  if (fs.existsSync(source)) fs.copyFileSync(source, target);
}
if (fs.existsSync('data/international')) {
  fs.rmSync('public/data/international', {recursive:true, force:true});
  fs.cpSync('data/international', 'public/data/international', {recursive:true});
}
const catalog = JSON.parse(fs.readFileSync('public/data/chargers-spain.json', 'utf8'));
if (!Array.isArray(catalog.chargers) || !catalog.chargers.length) {
  throw Error('No hay un catálogo publicado válido para recuperar');
}
console.log('Catálogo recuperado:', catalog.chargers.length, 'estaciones; importado', catalog.updated);
