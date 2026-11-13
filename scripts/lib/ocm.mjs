import fs from 'node:fs';
const boundsMetadata=JSON.parse(fs.readFileSync(new URL('../data/country-bounds.json',import.meta.url),'utf8'));
// OCM export README requires the licence of each individual data provider.
// https://github.com/openchargemap/ocm-export#data-licensing-notes
const connectorTypes = {1:'Tipo1',2:'CHAdeMO',25:'Tipo2',1036:'Tipo2',28:'Schuko',33:'CCS',32:'CCS1',27:'NACS',1038:'GB/T AC',1039:'GB/T AC',1040:'GB/T DC',1044:'ChaoJi'};
const text = value => typeof value === 'string' ? value.trim() : '';
const numeric = value => value !== null && value !== '' && value !== undefined ? Number(value) : NaN;
export function providerLicense(provider) {
 if (!provider || provider.IsOpenDataLicensed !== true || provider.IsApprovedImport !== true || provider.DataProviderStatusType?.IsProviderEnabled !== true) return null;
 const license = text(provider.License);
 // Ambiguous agreements, noncommercial/sharealike terms and unknown licences
 // require a separate review; the open-data flag alone is insufficient.
 if (/noncommercial|non-commercial|\bnc\b|sharealike|share.alike|\bsa\b/i.test(license)) return null;
 let licenseUrl;
 if (/\bCC[ -]?0\b/i.test(license)) licenseUrl='https://creativecommons.org/publicdomain/zero/1.0/';
 else if (/attribution 4\.0|CC[ -]?BY\s*4\.0/i.test(license)) licenseUrl='https://creativecommons.org/licenses/by/4.0/';
 else if (/creativecommons\.org\/licenses\/by\/3\.0/i.test(license)) licenseUrl='https://creativecommons.org/licenses/by/3.0/';
 else if (/Open Government Licence v2\.0/i.test(license)) licenseUrl='https://www.nationalarchives.gov.uk/doc/open-government-licence/version/2/';
 else if (/etalab\.gouv\.fr.*Licence_Ouverte\.pdf/i.test(license)) licenseUrl='https://www.etalab.gouv.fr/wp-content/uploads/2014/05/Licence_Ouverte.pdf';
 else return null;
 return {id:provider.ID,name:text(provider.Title),license,licenseUrl,url:text(provider.WebsiteURL),openData:true,approvedImport:true,providerEnabled:true};
}
export function withinCountryBounds(country,lat,lng,{countryBounds=boundsMetadata.countries,boundsMarginDegrees=1}={}) {
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return false;
 if(!Number.isFinite(boundsMarginDegrees)||boundsMarginDegrees<0||boundsMarginDegrees>5)throw Error('Invalid country coordinate tolerance');
 const boxes=countryBounds?.[country];
 // Missing geometry does not establish an error. This is a gross-error filter,
 // not a border, sovereignty or road-access decision.
 if(!Array.isArray(boxes)||!boxes.length)return true;
 return boxes.some(([west,south,east,north])=>lat>=south-boundsMarginDegrees&&lat<=north+boundsMarginDegrees&&(west<=east?lng>=west-boundsMarginDegrees&&lng<=east+boundsMarginDegrees:lng>=west-boundsMarginDegrees||lng<=east+boundsMarginDegrees));
}
export const OCM_GEOGRAPHY_SOURCE={source:boundsMetadata.source,url:boundsMetadata.sourceUrl,license:boundsMetadata.license,licenseUrl:boundsMetadata.licenseUrl,method:boundsMetadata.method};
export function parseOcmPoint(point, country, reference, importedAt = new Date().toISOString(),options={}) {
 const published=new Set((reference.SubmissionStatusTypes||[]).filter(s=>s.IsLive===true).map(s=>s.ID));
 if(!published.has(point?.SubmissionStatusTypeID))return {reason:'unpublished'};
 const operational=new Set([10,20,50,75]); // static declaration, never live availability
 if(point.StatusTypeID!=null&&point.StatusTypeID!==0&&!operational.has(point.StatusTypeID))return {reason:'not_operational'};
 const provider=providerLicense((reference.DataProviders||[]).find(p=>p.ID===point.DataProviderID));
 if(!provider)return {reason:'license_unreviewed'};
 const a=point.AddressInfo||{},lat=numeric(a.Latitude),lng=numeric(a.Longitude);
 const sourceCountry=(reference.Countries||[]).find(c=>c.ID===a.CountryID)?.ISOCode;
 if(sourceCountry!==country)return {reason:'country_mismatch'};
 if(!Number.isSafeInteger(point.ID)||point.ID<=0||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return {reason:'coordinates_or_id'};
 if(!withinCountryBounds(country,lat,lng,options))return {reason:'country_coordinates_outside_bounds'};
 const connectors=(Array.isArray(point.Connections)?point.Connections:[]).flatMap(c=>{
  const type=connectorTypes[c.ConnectionTypeID],powerKw=numeric(c.PowerKW);
  if(!type||!Number.isFinite(powerKw)||powerKw<=0||c.StatusTypeID!=null&&c.StatusTypeID!==0&&!operational.has(c.StatusTypeID))return [];
  // Type 2 is AC; a source that explicitly says DC is inconsistent.
  if(type==='Tipo2'&&c.CurrentTypeID===30)return [];
  return [{type,powerKw,powerType:c.CurrentTypeID===30?'DC':c.CurrentTypeID===10||c.CurrentTypeID===20?'AC':undefined,officialConnectorId:null,sourceConnectorId:c.ID??null,price:null}];
 });
 if(!connectors.length)return {reason:'no_supported_connector_power'};
 const usage=(reference.UsageTypes||[]).find(x=>x.ID===point.UsageTypeID);
 const sourceUrl='https://openchargemap.org/site/poi/details/'+point.ID;
 const declaredUsageCost=text(point.UsageCost)||null;
 return {station:{id:'ocm-global-'+country+'-'+point.ID,name:text(a.Title)||'Open Charge Map',city:text(a.Town),province:text(a.StateOrProvince),address:text(a.AddressLine1),country,lat,lng,power:Math.max(...connectors.map(c=>c.powerKw)),connector:[...new Set(connectors.map(c=>c.type))].join(', '),connectors,price:null,priceSource:null,priceVerifiedAt:null,declaredUsageCost,operator:text(point.OperatorInfo?.Title)||(reference.Operators||[]).find(o=>o.ID===point.OperatorID)?.Title||'',source:'Open Charge Map · '+provider.name+' · '+country+' · '+point.ID,sourceUrl,dataProvider:provider,sourceRecordId:point.ID,sourceUpdatedAt:text(point.DateLastVerified)||text(point.DateLastStatusUpdate)||null,importedAt,verified:'Información declarada por la fuente; no comprobada presencialmente',availability:'No verificada en tiempo real',operationalStatus:point.StatusTypeID??null,access:usage?.Title||'Acceso desconocido',publicAccess:[1,5].includes(point.UsageTypeID),condition:'Confirmar acceso, horario, precio y disponibilidad con el operador. '+(declaredUsageCost?'Tarifa declarada (no verificada): '+declaredUsageCost+'. ':'Tarifa desconocida. ')+text(point.GeneralComments),licenseNotice:'Datos normalizados desde OCM; atribución y licencia del proveedor conservadas.'}};
}
export function validPersistedOcm(station,options={}) {
 const stored=station?.dataProvider;
 const license=providerLicense({ID:stored?.id,Title:stored?.name,License:stored?.license,WebsiteURL:stored?.url,IsOpenDataLicensed:stored?.openData,IsApprovedImport:stored?.approvedImport,DataProviderStatusType:{IsProviderEnabled:stored?.providerEnabled}});
 return !!license&&license.licenseUrl===stored.licenseUrl&&/^ocm-global-[A-Z]{2}-\d+$/.test(String(station?.id))&&station.id.startsWith('ocm-global-'+station.country+'-')&&station.sourceUrl?.startsWith('https://openchargemap.org/site/poi/details/')&&Array.isArray(station.connectors)&&station.connectors.length>0&&station.connectors.every(c=>c.type&&Number.isFinite(c.powerKw)&&c.powerKw>0)&&Number.isFinite(station.lat)&&Math.abs(station.lat)<=90&&Number.isFinite(station.lng)&&Math.abs(station.lng)<=180&&withinCountryBounds(station.country,station.lat,station.lng,options);
}
