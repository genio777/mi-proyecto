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
    return Number.isFinite(parsed.getTime()) && parsed.getTime() <= now + 300000 ? parsed.toLocaleString('es-ES',{timeZone:'Europe/Madrid'}) : 'fecha desconocida';
  };
  const imported = typeof catalog?.updated === 'string' ? Date.parse(catalog.updated) : NaN;
  const age = (now - imported) / 3600000;
  const freshness = Number.isFinite(age) && age > 48 ? ' · ATENCIÓN: catálogo nacional importado hace más de 48 horas' : Number.isFinite(age) && age > 24 ? ' · catálogo nacional importado hace más de 24 horas' : '';
  const reve = chargers.filter(c => String(c.id || '').startsWith('reve:')).length;
  const reveMetadata = catalog?.reveApi;
  // Only public, documented sync states and dates belong in the browser.
  // Unknown status text and arbitrary credential metadata are never displayed.
  const reveStates = {
    credential_expired:'credencial caducada; sincronización detenida',
    credential_expiry_invalid:'fecha de caducidad de la credencial no válida; sincronización detenida',
    unauthorized:'acceso no autorizado; sincronización detenida',
    not_configured:'sin credencial configurada; sincronización pendiente',
    synced:'inventario sincronizado según la última ejecución',
    partial:'sincronización parcial; inventario anterior conservado',
    sync_failed:'falló la sincronización; inventario anterior conservado',
    rate_limited:'límite de consultas del proveedor; sincronización aplazada',
    rate_budget_wait:'esperando al siguiente intervalo de consultas',
    cached:'inventario conservado en caché'
  };
  const reveState = Object.hasOwn(reveStates,reveMetadata?.status) ? reveStates[reveMetadata.status] : 'estado de sincronización no indicado';
  const lastReveSuccess = date(reveMetadata?.lastSuccess);
  const reveHistory = lastReveSuccess === 'fecha desconocida' ? 'sin fecha de importación REVE correcta confirmada' : 'última importación REVE correcta: '+lastReveSuccess;
  let reveExpiry = '';
  const expiresOn = reveMetadata?.credentialExpiresOn;
  if (typeof expiresOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) {
    const parsed = new Date(expiresOn+'T12:00:00.000Z');
    if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === expiresOn) reveExpiry = ' · fecha de caducidad configurada: '+parsed.toLocaleDateString('es-ES',{timeZone:'Europe/Madrid'})+' inclusive';
  }
  const reveInformation = 'REVE API: '+reveState+' · '+number(reve)+' registros REVE API'+(reve>0?' en caché de inventario':' en catálogo')+' · '+reveHistory+reveExpiry;
  const list = countries.slice(0,12).join(', ') + (countries.length > 12 ? ' y '+number(countries.length-12)+' más' : '');
  const international = availableOcm ? number(availableOcm)+' registros OCM'+(indexed.length?' disponibles para cargar':'')+(countries.length?' en '+number(countries.length)+' países/territorios ('+list+')':' · países no indicados') : 'sin registros OCM internacionales importados';
  return number(chargers.length)+' puntos cargados de catálogo · fuentes nacionales de España y '+international+' · '+reveInformation+' · importación nacional: '+date(catalog?.updated)+freshness+' · última ejecución OCM: '+date(catalog?.internationalSource?.updatedAt)+' · cobertura parcial según fuentes; importar no verifica precios, gratuidad ni ocupación';
}
