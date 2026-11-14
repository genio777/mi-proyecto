// Only saved personal settings belong in a portable backup. Catalogue records,
// search caches, credentials and live vehicle readings are deliberately absent.
export const MAX_PERSONAL_BACKUP_BYTES=2*1024*1024;
export const PERSONAL_DATA_KEYS=Object.freeze(['cg_favorites','cg_local_free_chargers','cg_vehicle_profiles_v2','cg_vehicle_connectors','cg_connectors','cg_connector','cg_vehicle_name','cg_battery_kwh','cg_consumption_kwh','cg_max_charge_kw','cg_max_ac_kw','cg_soc','cg_reserve','cg_max_power','cg_operator_mode','cg_selected_operators','cg_tesla_rate','cg_unknown_rate','cg_cost_simulator_v1']);
const keys=new Set(PERSONAL_DATA_KEYS),connectors=new Set(['CCS','Tipo2','CHAdeMO']),forbidden=new Set(['__proto__','prototype','constructor']);
const labels={cg_favorites:'favoritos',cg_local_free_chargers:'puntos personales',cg_vehicle_profiles_v2:'perfiles de vehículo',cg_vehicle_connectors:'conectores de cada vehículo',cg_connectors:'filtro de conectores',cg_connector:'filtro de conector anterior',cg_vehicle_name:'modelo de vehículo',cg_battery_kwh:'capacidad de batería guardada',cg_consumption_kwh:'consumo guardado',cg_max_charge_kw:'potencia DC guardada',cg_max_ac_kw:'potencia AC guardada',cg_soc:'SOC de salida',cg_reserve:'reserva mínima',cg_max_power:'límite de potencia de cargadores',cg_operator_mode:'modo de selección de operadores',cg_selected_operators:'operadores seleccionados',cg_tesla_rate:'tarifa manual Tesla',cg_unknown_rate:'tarifa manual para precios desconocidos',cg_cost_simulator_v1:'simulación de costes guardada'};
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&(Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const number=(x,min,max)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
const text=(x,max=500)=>typeof x==='string'&&x.length>0&&x.length<=max;
function invalid(){throw Error('La copia contiene datos personales no válidos.');}
function strings(value,max=10000){if(!Array.isArray(value)||value.length>max||value.some(x=>!text(x,300)))invalid();return [...new Set(value)];}
function connectorList(value){const result=strings(value,3);if(result.some(x=>!connectors.has(x)))invalid();return result;}
function dictionary(value,normalise){
 if(!plain(value)||Object.keys(value).length>100)invalid();
 const result={};
 for(const [name,item]of Object.entries(value)){if(!text(name,200)||forbidden.has(name))invalid();result[name]=normalise(item,name);}
 return result;
}
function profile(value,name){
 const maxAc=value?.maxAc??(name==='Renault Zoe R90'?22:11);
 if(!plain(value)||!number(value.battery,.1,250)||!number(value.consumption,.1,80)||!number(value.maxCharge,0,1000)||!number(maxAc,.1,500))invalid();
 return {battery:value.battery,consumption:value.consumption,maxCharge:value.maxCharge,maxAc};
}
function localPoint(value){
 if(!plain(value)||!text(value.id,300)||!value.id.startsWith('local-')||!text(value.name,300)||!number(value.lat,-90,90)||!number(value.lng,-180,180)||!number(value.power,.1,500)||!connectors.has(value.connector))invalid();
 for(const name of ['city','address'])if(value[name]!==undefined&&typeof value[name]!=='string')invalid();
 if((value.city?.length||0)>500||(value.address?.length||0)>4000)invalid();
 // Personal imports can never certify a tariff, availability, licence or source.
 return {id:value.id,name:value.name,city:value.city||'Aportación local',address:value.address||'',lat:value.lat,lng:value.lng,power:value.power,connector:value.connector,price:null,source:'Aportación personal sin verificar',verified:'Pendiente de verificación'};
}
function cost(value){
 if(!plain(value)||![value.costKwh,value.costFixed,value.costMinutes,value.costPerMinute].every(x=>number(x,0,1000000))||!['asc','desc'].includes(value.costSort)||typeof value.costSearch!=='string'||value.costSearch.length>500||typeof value.costVerifiedOnly!=='boolean')invalid();
 return {costKwh:value.costKwh,costFixed:value.costFixed,costMinutes:value.costMinutes,costPerMinute:value.costPerMinute,costSort:value.costSort,costSearch:value.costSearch,costVerifiedOnly:value.costVerifiedOnly};
}
function setting(key,value){
 if(!keys.has(key))throw Error('La copia contiene un ajuste no admitido.');
 if(key==='cg_favorites'||key==='cg_selected_operators')return strings(value);
 if(key==='cg_local_free_chargers'){if(!Array.isArray(value)||value.length>2000)invalid();const result=value.map(localPoint);if(new Set(result.map(x=>x.id)).size!==result.length)invalid();return result;}
 if(key==='cg_vehicle_profiles_v2')return dictionary(value,profile);
 if(key==='cg_vehicle_connectors')return dictionary(value,connectorList);
 if(key==='cg_connectors')return connectorList(value);
 if(key==='cg_connector'){if(!connectors.has(value))invalid();return value;}
 if(key==='cg_vehicle_name'){if(!text(value,200)||forbidden.has(value))invalid();return value;}
 if(key==='cg_operator_mode'){if(!['all','tesla','custom'].includes(value))invalid();return value;}
 if(key==='cg_cost_simulator_v1')return cost(value);
 const ranges={cg_battery_kwh:[.1,250],cg_consumption_kwh:[.1,80],cg_max_charge_kw:[0,1000],cg_max_ac_kw:[.1,500],cg_soc:[1,100],cg_reserve:[0,50],cg_max_power:[0,1000],cg_tesla_rate:[0,5],cg_unknown_rate:[0,5]};
 const range=ranges[key];if(!range||!number(value,...range))invalid();return value;
}
const rawStringKeys=new Set(['cg_connector','cg_vehicle_name','cg_operator_mode']);
const encode=(key,value)=>rawStringKeys.has(key)?value:JSON.stringify(value);
const decode=(key,value)=>rawStringKeys.has(key)?value:JSON.parse(value);
export function browserPersonalStorage(){try{return globalThis.localStorage??null;}catch{return null;}}
export function loadPersonalSetting(key,fallback,storage=browserPersonalStorage()){
 try{const raw=storage?.getItem(key);return raw===null||raw===undefined?fallback:setting(key,decode(key,raw));}catch{return fallback;}
}
export function validPersonalSetting(key,value){try{setting(key,value);return true;}catch{return false;}}
export function savePersonalSetting(key,value,storage=browserPersonalStorage()){
 try{if(!storage)return false;storage.setItem(key,encode(key,setting(key,value)));return true;}catch{return false;}
}
export function createPersonalBackup(storage=browserPersonalStorage(),now=new Date()){
 if(!storage)throw Error('El almacenamiento de este dispositivo no está disponible.');
 const settings={},warnings=[];
 for(const key of PERSONAL_DATA_KEYS){
  let raw;try{raw=storage.getItem(key);}catch{throw Error('No se pudieron leer los datos guardados en este dispositivo.');}
  if(raw===null)continue;
  try{settings[key]=setting(key,decode(key,raw));}catch{warnings.push('Se ha omitido un dato guardado no válido: '+labels[key]+'.');}
 }
 const document={format:'cargagratis-personal-data',version:1,createdAt:now.toISOString(),settings};
 if(new TextEncoder().encode(JSON.stringify(document)).length>MAX_PERSONAL_BACKUP_BYTES)throw Error('Los datos guardados superan el tamaño máximo de copia (2 MB).');
 return {document,warnings};
}
function validateDocument(document){
 if(!plain(document)||document.format!=='cargagratis-personal-data'||document.version!==1||typeof document.createdAt!=='string'||!Number.isFinite(Date.parse(document.createdAt))||!plain(document.settings))throw Error('El archivo no es una copia compatible de Carga Gratis España Jpaz.');
 if(Object.keys(document).some(key=>!['format','version','createdAt','settings'].includes(key)))throw Error('El archivo contiene campos de copia no admitidos.');
 const settings={};for(const [key,value]of Object.entries(document.settings))settings[key]=setting(key,value);
 if(new TextEncoder().encode(JSON.stringify(document)).length>MAX_PERSONAL_BACKUP_BYTES)throw Error('La copia supera el tamaño máximo permitido (2 MB).');
 return {format:'cargagratis-personal-data',version:1,createdAt:document.createdAt,settings};
}
export function parsePersonalBackup(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_PERSONAL_BACKUP_BYTES)throw Error('La copia supera el tamaño máximo permitido (2 MB).');
 let document;try{document=JSON.parse(text);}catch{throw Error('El archivo no contiene JSON válido.');}
 return validateDocument(document);
}
export function restorePersonalBackup(document,storage=browserPersonalStorage()){
 const validated=validateDocument(document);
 if(!storage)throw Error('El almacenamiento de este dispositivo no está disponible.');
 const before=new Map();
 try{for(const key of Object.keys(validated.settings))before.set(key,storage.getItem(key));}
 catch{throw Error('No se pueden leer los ajustes actuales; no se ha restaurado ningún dato.');}
 const written=[];
 try{for(const [key,value]of Object.entries(validated.settings)){storage.setItem(key,encode(key,value));written.push(key);}}
 catch{
  let rollbackFailed=false;
  for(const key of written.reverse())try{const value=before.get(key);if(value===null)storage.removeItem(key);else storage.setItem(key,value);}catch{rollbackFailed=true;}
  if(rollbackFailed)throw Error('No se pudo completar la restauración ni recuperar todos los valores anteriores. Conserva la copia y revisa el almacenamiento del dispositivo.');
  throw Error('No se pudo guardar la copia. Se han conservado los datos anteriores.');
 }
 return summarizePersonalBackup(validated);
}
export function summarizePersonalBackup(document){
 const {settings}=validateDocument(document);
 return {favorites:settings.cg_favorites?.length||0,localChargers:settings.cg_local_free_chargers?.length||0,vehicleProfiles:Object.keys(settings.cg_vehicle_profiles_v2||{}).length,settings:Object.keys(settings).length};
}
