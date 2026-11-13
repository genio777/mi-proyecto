import {safeExternalUrl} from './catalog-presentation.mjs';
const weekMs=7*86400000;
const text=value=>typeof value==='string'?value.trim():'';
const quoteSources=new Set(['station','reference','manual']);
function evidenceLink(value){
 const safe=safeExternalUrl(value);if(!safe)return null;
 const url=new URL(safe),credentialNames=new Set(['apikey','key','token','accesstoken','authorization','auth','password','passwd','secret','clientsecret','signature','sig']);
 const privateParameter=params=>[...params.keys()].some(name=>credentialNames.has(name.toLowerCase().replace(/[^a-z0-9]/g,'')));
 if(privateParameter(url.searchParams)||privateParameter(new URLSearchParams(url.hash.slice(1).replace(/^.*\?/,''))))return null;
 return safe;
}
function sourceDate(value,now){
 if(typeof value!=='string'||!Number.isFinite(now)||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value))return null;
 const day=value.slice(0,10),dayEpoch=Date.parse(day+'T00:00:00.000Z');
 if(!Number.isFinite(dayEpoch)||new Date(dayEpoch).toISOString().slice(0,10)!==day)return null;
 const epoch=Date.parse(value);
 if(!Number.isFinite(epoch)||epoch>now)return null;
 return {value,epoch};
}
function dateLabel(date){
 if(!date)return 'Fecha no indicada por la fuente';
 // A date without a time does not establish an hour of verification.
 if(date.value.length===10){const [year,month,day]=date.value.split('-');return day+'/'+month+'/'+year;}
 return new Date(date.epoch).toLocaleString('es-ES',{timeZone:'Europe/Madrid'});
}
export function describeStationEvidence(station,quote,now=Date.now()){
 const record=station&&typeof station==='object'?station:{};
 const validQuote=quote&&typeof quote==='object'&&quoteSources.has(quote.source)&&typeof quote.rate==='number'&&Number.isFinite(quote.rate)&&quote.rate>=0;
 const priceSource=evidenceLink(record.priceSource),verified=sourceDate(record.priceVerifiedAt,now);
 const recent=verified&&now-verified.epoch<=weekMs;
 const matchesRecord=typeof record.price==='number'&&Number.isFinite(record.price)&&record.price>=0&&record.price===quote?.rate;
 let status='unknown',reason='El cálculo no dispone de una tarifa válida. Precio desconocido no significa recarga gratuita.';
 if(validQuote){
  if(quote.source==='station'&&priceSource&&recent&&matchesRecord){status='confirmed';reason='Tarifa del punto con fuente y comprobación reciente. Confirma posibles cambios con el operador.';}
  else {
   status='estimated';
   reason=quote.source==='manual'?'Importe introducido por el usuario para esta simulación; no acredita la tarifa del operador.':quote.source==='reference'?'Referencia orientativa del operador; puede variar según toma, horario y condiciones.':'Precio registrado sin verificación reciente suficiente para confirmar esta tarifa.';
  }
 }
 const date=sourceDate(record.sourceUpdatedAt,now)||sourceDate(record.reveUpdated,now);
 const provider=record.dataProvider&&typeof record.dataProvider==='object'?record.dataProvider:{};
 return {
  price:{status,label:status==='confirmed'?'Confirmado':status==='estimated'?'Estimado':'Desconocido',rate:validQuote?quote.rate:null,reason,verifiedAt:status==='confirmed'?verified.value:null,sourceUrl:status==='confirmed'?priceSource:null},
  source:{name:text(record.source)||'Fuente no indicada',url:evidenceLink(record.sourceUrl),updatedAt:date?.value||null,updatedLabel:dateLabel(date),providerName:text(provider.name)||null,providerUrl:evidenceLink(provider.url),license:text(provider.license)||null,licenseUrl:evidenceLink(provider.licenseUrl)},
  availability:{label:'Sin confirmar en tiempo real',detail:'Consulta el estado y el acceso con el operador antes de desplazarte. La importación de datos no confirma que haya una toma libre.'}
 };
}
