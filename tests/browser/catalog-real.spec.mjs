import { test, expect } from '@playwright/test';

const distanceKm = (a, b) => {
  const rad = value => value * Math.PI / 180;
  const dlat = rad(b[0] - a[0]), dlng = rad(b[1] - a[1]);
  return 12742 * Math.asin(Math.sqrt(Math.sin(dlat / 2) ** 2
    + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dlng / 2) ** 2));
};

test('real published catalog loads Moscow stations and their licenses without inventing prices', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const center = [55.75, 37.61];
  const manifestResponse = await page.request.get('/data/international/index.json');
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  const entry = manifest.countries.find(country => country.code === 'RU');
  expect(entry, 'Published manifest includes Russia').toBeTruthy();
  expect(entry.count).toBeGreaterThan(0);
  const shardResponse = await page.request.get('/data/international/' + entry.file);
  expect(shardResponse.ok()).toBe(true);
  const shard = await shardResponse.json();
  expect(shard.country).toBe('RU');
  expect(shard.chargers).toHaveLength(entry.count);
  const nearby = shard.chargers.filter(station => distanceKm(center, [station.lat, station.lng]) <= 15);
  expect(nearby.length, 'Real OCM data near Moscow').toBeGreaterThan(0);
  expect(nearby.every(station => station.price === null)).toBe(true);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Cargadores', exact: true })).toBeVisible();
  await page.getByLabel('Buscar cargadores', { exact: true }).fill('55.75, 37.61');
  const loaded = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/data/international/RU.json') && response.ok());
  await page.getByRole('button', { name: 'Buscar zona', exact: true }).click();
  await loaded;
  await expect(page.getByText('Cargadores a 15 km del punto buscado', { exact: true })).toBeVisible();
  await expect(page.getByText(new RegExp('Resultados: ' + nearby.length + ' puntos'))).toBeVisible();
  const cards = page.locator('.cards article');
  await expect(cards).toHaveCount(Math.min(nearby.length, 100));
  const first = cards.first();
  const firstHeading = await first.getByRole('heading').textContent();
  expect(nearby.some(station => station.name === firstHeading)).toBe(true);
  await expect(first.getByRole('link', { name: 'Registro de la fuente', exact: true })).toHaveAttribute('href', /^https:\/\/openchargemap\.org\//);
  await expect(first.getByRole('link', { name: 'Licencia del proveedor', exact: true })).toHaveAttribute('href', /^https:\/\//);
  await expect(first).toContainText('Precio no disponible');
  await expect(first.locator('strong')).not.toContainText(/Gratis|0\.00/);
  await page.locator('#map').screenshot({ path: testInfo.outputPath('moscow-real-map.png') });
  await first.screenshot({ path: testInfo.outputPath('moscow-real-station.png') });
  expect(errors, 'No uncaught browser errors with the real catalog').toEqual([]);
});
