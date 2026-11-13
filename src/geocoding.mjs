// Photon serves OpenStreetMap data (ODbL). Searches are explicit user actions,
// cached and serialized: the public demo permits reasonable use, without SLA.
// https://github.com/komoot/photon#demo-server
export const DEFAULT_GEOCODING_ENDPOINT = 'https://photon.komoot.io/api/';
const CACHE_TTL_MS = 30 * 86400000;
const countryCodes = ('AD AE AF AL AM AO AR AT AU AZ BA BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS YE ZA ZM ZW').split(' ');
export const normalizeCountry = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const countries = new Map();
for (const language of ['es', 'en', 'fr', 'de', 'ru']) {
  try {
    const names = new Intl.DisplayNames([language], {type: 'region'});
    for (const code of countryCodes) countries.set(normalizeCountry(names.of(code)), code);
  } catch { /* Older WebViews still have the explicit names below. */ }
}
for (const code of countryCodes) countries.set(code.toLowerCase(), code);
for (const [name, code] of Object.entries({
  'españa':'ES',spain:'ES',holanda:'NL','países bajos':'NL',netherlands:'NL',nederland:'NL',
  'reino unido':'GB','united kingdom':'GB',inglaterra:'GB',uk:'GB',rusia:'RU',russia:'RU','россия':'RU',
  alemania:'DE',germany:'DE',deutschland:'DE',francia:'FR',france:'FR',belgica:'BE',belgium:'BE',
  suiza:'CH',switzerland:'CH',chequia:'CZ',czechia:'CZ',turquia:'TR',türkiye:'TR',turkey:'TR',
  china:'CN','中国':'CN',japon:'JP',japan:'JP','日本':'JP','corea del sur':'KR','south korea':'KR',
  'kazajistán':'KZ',kazakhstan:'KZ',india:'IN','emiratos árabes unidos':'AE',
  portugal:'PT',italia:'IT',italy:'IT','taiwán':'TW',taiwan:'TW'
})) countries.set(normalizeCountry(name), code);

export function parseCoordinates(raw) {
  const q = raw.trim();
  // Semicolon also permits decimal commas: 40,4168; -3,7038.
  const match = q.includes(';')
    ? q.match(/^([+-]?\d{1,3}(?:[.,]\d+)?)\s*;\s*([+-]?\d{1,3}(?:[.,]\d+)?)$/)
    : q.match(/^([+-]?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*([+-]?\d{1,3}(?:\.\d+)?)$/);
  if (!match) return null;
  const coords = match.slice(1).map(x => Number(x.replace(',', '.')));
  if (!validCoordinates(coords)) throw Error('Coordenadas fuera de rango');
  return coords;
}
function validCoordinates(coords) {
  return Array.isArray(coords) && coords.length === 2 && coords.every(n => typeof n === 'number' && Number.isFinite(n)) && Math.abs(coords[0]) <= 90 && Math.abs(coords[1]) <= 180;
}

export function prepareLocationQuery(raw) {
  const q = String(raw).trim().replace(/\s+/g, ' ');
  if (!q) throw Error('Introduce una ubicación');
  const coordinates = parseCoordinates(q);
  if (coordinates) return {coordinates};
  if (/\b(?:A|AP|N|E|SE|H|HU|CA|MA|CO|EX|CM|CL|CV|M)-?\d+[\w-]*\b.*\b(?:km|kil[oó]metro|p\.?k\.?)\s*\d+/i.test(q)) throw Error('No hay coordenadas verificadas para '+q+'. Introduce latitud, longitud.');
  if (/^\d{3,8}$/.test(q)) throw Error('El código postal necesita país o localidad: por ejemplo, «10115, Alemania» o «28013, España».');
  const segments = q.split(',').map(s => s.trim()).filter(Boolean);
  let country = countries.get(normalizeCountry(segments.at(-1))) || '';
  let query = country && segments.length > 1 ? segments.slice(0, -1).join(', ') : q;
  // Also accept country names after a postcode/address without a comma.
  if (!country) {
    const words = q.split(' ');
    for (let length = Math.min(4, words.length - 1); length >= 1; length--) {
      const candidate = countries.get(normalizeCountry(words.slice(-length).join(' ')));
      if (candidate) {country = candidate; query = words.slice(0, -length).join(' '); break;}
    }
  }
  const nl = /^([1-9]\d{3})\s?([A-Z]{2})$/i.exec(query);
  if (nl && (!country || country === 'NL')) {country = 'NL'; query = nl[1]+' '+nl[2].toUpperCase();}
  if (!country && /^(?:GIR\s?0AA|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})$/i.test(query)) country = 'GB';
  if (!country && /^\d{3}-\d{4}$/.test(query)) country = 'JP';
  return {query, country};
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason || new DOMException('Cancelado', 'AbortError'));
    const timer = setTimeout(done, ms);
    const abort = () => {clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(signal.reason || new DOMException('Cancelado', 'AbortError'));};
    function done() {signal?.removeEventListener('abort', abort); resolve();}
    signal?.addEventListener('abort', abort, {once:true});
  });
}

export function createGeocoder({fetchFn = (...args) => fetch(...args), storage = null, endpoint = DEFAULT_GEOCODING_ENDPOINT, minimumIntervalMs = 1100, now = () => Date.now(), sleep = wait} = {}) {
  let queue = Promise.resolve(), lastStarted = -Infinity;
  const memory = new Map();
  const cachePrefix = 'cg_geo_photon_v1_';
  return async function geocode(raw, {signal} = {}) {
    const prepared = prepareLocationQuery(raw);
    if (signal?.aborted) throw signal.reason || new DOMException('Cancelado', 'AbortError');
    if (prepared.coordinates) return prepared.coordinates;
    const {query, country} = prepared;
    const key = cachePrefix + country + '_' + query.toLowerCase();
    const cached = memory.get(key) || (() => {try {return JSON.parse(storage?.getItem(key) || 'null');} catch {return null;}})();
    if (cached && validCoordinates(cached.coords) && now() - cached.savedAt >= 0 && now() - cached.savedAt < CACHE_TTL_MS) return [...cached.coords];
    const job = queue.catch(() => {}).then(async () => {
      if (signal?.aborted) throw signal.reason || new DOMException('Cancelado', 'AbortError');
      const repeated = memory.get(key);
      if (repeated && now() - repeated.savedAt < CACHE_TTL_MS) return [...repeated.coords];
      await sleep(Math.max(0, minimumIntervalMs - (now() - lastStarted)), signal);
      if (signal?.aborted) throw signal.reason || new DOMException('Cancelado', 'AbortError');
      lastStarted = now();
      const base = typeof endpoint === 'function' ? await endpoint() : endpoint;
      const url = new URL(base);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw Error('Servicio de búsqueda mal configurado');
      url.searchParams.set('q', query);
      url.searchParams.set('limit', '8');
      url.searchParams.set('lang', 'en'); // Photon demo supports en/de/fr/local, not Spanish.
      if (country) url.searchParams.set('countrycode', country);
      const controller = new AbortController();
      const abort = () => controller.abort(signal.reason);
      signal?.addEventListener('abort', abort, {once:true});
      const timeout = setTimeout(() => controller.abort(new Error('La búsqueda ha agotado el tiempo de espera')), 15000);
      try {
        const response = await fetchFn(url.toString(), {signal:controller.signal, headers:{Accept:'application/json'}});
        if (!response.ok) throw Error(response.status === 429 ? 'El servicio de búsqueda ha limitado las consultas. Espera y vuelve a intentarlo.' : 'Servicio de búsqueda no disponible (HTTP '+response.status+')');
        const data = await response.json();
        const features = Array.isArray(data?.features) ? data.features : [];
        const match = features.find(feature => {
          const coords = feature?.geometry?.coordinates;
          return feature?.geometry?.type === 'Point' && validCoordinates(Array.isArray(coords) ? [coords[1], coords[0]] : null) && (!country || String(feature.properties?.countrycode).toUpperCase() === country);
        });
        if (!match) throw Error('No se ha podido localizar '+raw+'. Añade ciudad y país o introduce latitud, longitud.');
        const coords = [match.geometry.coordinates[1], match.geometry.coordinates[0]];
        const saved = {coords, savedAt:now()};
        memory.set(key, saved);
        try {storage?.setItem(key, JSON.stringify(saved));} catch { /* Private mode/quota: memory cache still works. */ }
        return coords;
      } catch (error) {
        if (signal?.aborted) throw signal.reason || error;
        if (controller.signal.aborted) throw Error('La búsqueda ha agotado el tiempo de espera. Vuelve a intentarlo.');
        throw error;
      } finally {clearTimeout(timeout); signal?.removeEventListener('abort', abort);}
    });
    queue = job;
    return job;
  };
}

let serviceConfig;
async function configuredEndpoint() {
  serviceConfig ||= fetch('./geocoding-config.json', {cache:'no-cache', signal:AbortSignal.timeout(4000)})
    .then(response => response.ok ? response.json() : null).catch(() => null);
  const config = await serviceConfig;
  return typeof config?.photonEndpoint === 'string' ? config.photonEndpoint : DEFAULT_GEOCODING_ENDPOINT;
}
const browserStorage = {getItem:key => {try{return globalThis.localStorage?.getItem(key);}catch{return null;}}, setItem:(key,value) => {try{globalThis.localStorage?.setItem(key,value);}catch{}}};
export const geocodeLocation = createGeocoder({storage:browserStorage, endpoint:configuredEndpoint});
