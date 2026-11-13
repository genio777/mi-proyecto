// Presentation only: never convert declarations, import dates or missing prices
// into verified tariffs, free charging or live availability.
export function safeExternalUrl(value) {
  if (typeof value !== 'string') return null;
  try {const url = new URL(value); return ['https:','http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;} catch {return null;}
}
export function describeCatalog(catalog, now = Date.now()) {
  const chargers = Array.isArray(catalog?.chargers) ? catalog.chargers : [];
  const ocm = chargers.filter(c => /Open Charge Map/i.test(String(c.source || '')) || /^ocm-global-/.test(String(c.id || '')));
  const actualCountries = new Set(ocm.map(c => c.country).filter(c => typeof c === 'string' && /^[A-Z]{2}$/.test(c)));
  const reported = catalog?.internationalSource?.countriesCovered;
  const counts = catalog?.internationalSource?.stationsByCountry;
  const indexed = counts && typeof counts === 'object' ? Object.entries(counts).filter(([code,count]) => /^[A-Z]{2}$/.test(code) && Number.isSafeInteger(count) && count > 0) : [];
  const countries = indexed.length ? indexed.map(([code])=>code).sort() : Array.isArray(reported) ? [...new Set(reported)].filter(code => actualCountries.has(code)).sort() : [...actualCountries].sort();
  const availableOcm = indexed.length ? indexed.reduce((sum,[,count])=>sum+Number(count),0) : ocm.length;
  const number = value => value.toLocaleString('es-ES');
  const date = value => {
    if (typeof value !== 'string' || !value) return 'fecha desconocida';
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) && parsed.getTime() <= now + 300000 ? parsed.toLocaleString('es-ES') : 'fecha desconocida';
  };
  const imported = typeof catalog?.updated === 'string' ? Date.parse(catalog.updated) : NaN;
  const age = (now - imported) / 3600000;
  const freshness = Number.isFinite(age) && age > 48 ? ' · ATENCIÓN: catálogo nacional importado hace más de 48 horas' : Number.isFinite(age) && age > 24 ? ' · catálogo nacional importado hace más de 24 horas' : '';
  const reve = chargers.filter(c => String(c.id || '').startsWith('reve:')).length;
  const list = countries.slice(0,12).join(', ') + (countries.length > 12 ? ' y '+number(countries.length-12)+' más' : '');
  const international = availableOcm ? number(availableOcm)+' registros OCM'+(indexed.length?' disponibles para cargar':'')+(countries.length?' en '+number(countries.length)+' países/territorios ('+list+')':' · países no indicados') : 'sin registros OCM internacionales importados';
  return number(chargers.length)+' puntos cargados de catálogo · fuentes nacionales de España y '+international+' · '+number(reve)+' registros REVE API · importación nacional: '+date(catalog?.updated)+freshness+' · última ejecución OCM: '+date(catalog?.internationalSource?.updatedAt)+' · cobertura parcial según fuentes; importar no verifica precios, gratuidad ni ocupación';
}
