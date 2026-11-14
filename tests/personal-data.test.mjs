import test from 'node:test';
import assert from 'node:assert/strict';
import {
 PERSONAL_DATA_KEYS,MAX_PERSONAL_BACKUP_BYTES,loadPersonalSetting,savePersonalSetting,
 createPersonalBackup,parsePersonalBackup,restorePersonalBackup,summarizePersonalBackup,
} from '../src/personal-data.mjs';

function memoryStorage(initial={}) {
 const values=new Map(Object.entries(initial));
 return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
}
const profile={battery:57.5,consumption:17,maxCharge:170,maxAc:11};
const point={id:'local-123',name:'Punto personal 日本',city:'Madrid',address:'Preguntar antes de cargar',lat:40.4168,lng:-3.7038,power:22,connector:'Tipo2',price:null,source:'Aportación personal sin verificar',verified:'Pendiente de verificación'};
const documentFor=settings=>({format:'cargagratis-personal-data',version:1,createdAt:'2026-11-14T12:00:00.000Z',settings});
const parse=settings=>parsePersonalBackup(JSON.stringify(documentFor(settings)));

test('malformed local values and unavailable storage return safe defaults instead of breaking startup',()=>{
 const storage=memoryStorage({cg_favorites:'null',cg_local_free_chargers:'{}',cg_vehicle_profiles_v2:'[',cg_soc:'Infinity',cg_selected_operators:'42'});
 for(const [key,fallback]of [['cg_favorites',[]],['cg_local_free_chargers',[]],['cg_vehicle_profiles_v2',{}],['cg_soc',90],['cg_selected_operators',[]]])assert.deepEqual(loadPersonalSetting(key,fallback,storage),fallback);
 const denied={getItem(){throw new DOMException('Blocked','SecurityError');}};
 assert.deepEqual(loadPersonalSetting('cg_favorites',[],denied),[]);
 assert.equal(loadPersonalSetting('cg_vehicle_name','Tesla Model Y Standard Range',denied),'Tesla Model Y Standard Range');
});

test('valid personal settings preserve Unicode, per-vehicle profiles and a zero manual tariff',()=>{
 const storage=memoryStorage({cg_favorites:'["ocm-global-JP-123"]',cg_vehicle_name:'Renault Zoe R90',cg_vehicle_profiles_v2:JSON.stringify({'Tesla Model Y Standard Range':profile}),cg_unknown_rate:'0'});
 assert.deepEqual(loadPersonalSetting('cg_favorites',[],storage),['ocm-global-JP-123']);
 assert.equal(loadPersonalSetting('cg_vehicle_name','',storage),'Renault Zoe R90');
 assert.equal(loadPersonalSetting('cg_unknown_rate',.5,storage),0);
 assert.deepEqual(loadPersonalSetting('cg_vehicle_profiles_v2',{},storage),{'Tesla Model Y Standard Range':profile});
 assert.equal(savePersonalSetting('cg_favorites',['ocm-global-JP-123','local-123'],storage),true);
 assert.deepEqual(JSON.parse(storage.getItem('cg_favorites')),['ocm-global-JP-123','local-123']);
});

test('legacy Tesla and Zoe profiles without AC power retain their saved values through load and backup',()=>{
 const legacy={'Tesla Model Y Standard Range':{battery:58.2,consumption:18.5,maxCharge:150},'Renault Zoe R90':{battery:40.2,consumption:15.2,maxCharge:0}};
 const raw=JSON.stringify(legacy),storage=memoryStorage({cg_vehicle_profiles_v2:raw});
 const expected={'Tesla Model Y Standard Range':{...legacy['Tesla Model Y Standard Range'],maxAc:11},'Renault Zoe R90':{...legacy['Renault Zoe R90'],maxAc:22}};
 assert.deepEqual(loadPersonalSetting('cg_vehicle_profiles_v2',{},storage),expected);
 const backup=createPersonalBackup(storage,new Date('2026-11-14T12:00:00Z'));
 assert.deepEqual(backup.warnings,[]);
 assert.deepEqual(backup.document.settings.cg_vehicle_profiles_v2,expected);
 const parsed=parsePersonalBackup(JSON.stringify(backup.document));
 assert.deepEqual(parsed.settings.cg_vehicle_profiles_v2,expected);
 const restored=memoryStorage();restorePersonalBackup(parsed,restored);
 assert.deepEqual(loadPersonalSetting('cg_vehicle_profiles_v2',{},restored),expected);
 assert.equal(storage.getItem('cg_vehicle_profiles_v2'),raw);
});

test('a denied write is reported without throwing from a persistence effect',()=>{
 const storage={getItem:()=>null,setItem(){throw new DOMException('Full','QuotaExceededError');}};
 assert.equal(savePersonalSetting('cg_favorites',['local-1'],storage),false);
});

test('export includes valid saved personal data and excludes geocoding caches, catalogues and credentials',()=>{
 const storage=memoryStorage({cg_favorites:'["local-123"]',cg_local_free_chargers:JSON.stringify([point]),cg_vehicle_profiles_v2:JSON.stringify({'Tesla Model Y Standard Range':profile}),cg_vehicle_connectors:JSON.stringify({'Tesla Model Y Standard Range':['CCS','Tipo2']}),cg_soc:'73',cg_geo_photon_v1_ES_madrid:'{"coords":[40.4,-3.7]}',REVE_API_KEY:'fixture-do-not-export',cg_catalog:'fixture-catalogue',unrelated:'keep'});
 const backup=createPersonalBackup(storage,new Date('2026-11-14T12:00:00.000Z'));
 assert.equal(backup.document.format,'cargagratis-personal-data');
 assert.equal(backup.document.version,1);
 assert.equal(backup.document.createdAt,'2026-11-14T12:00:00.000Z');
 assert.deepEqual(backup.document.settings.cg_local_free_chargers,[point]);
 assert.equal(backup.document.settings.cg_soc,73);
 for(const key of Object.keys(backup.document.settings))assert.ok(PERSONAL_DATA_KEYS.includes(key));
 assert.ok(!JSON.stringify(backup.document).includes('fixture-do-not-export'));
 assert.ok(!JSON.stringify(backup.document).includes('coords'));
 assert.equal(storage.getItem('unrelated'),'keep');
 assert.deepEqual(summarizePersonalBackup(backup.document),{favorites:1,localChargers:1,vehicleProfiles:1,settings:5});
});

test('export warns about malformed personal settings without modifying their saved bytes',()=>{
 const storage=memoryStorage({cg_favorites:'null',cg_soc:'72',cg_local_free_chargers:'not-json'});
 const before=[...storage.values];
 const backup=createPersonalBackup(storage,new Date('2026-11-14T12:00:00Z'));
 assert.equal(backup.document.settings.cg_soc,72);
 assert.ok(!Object.hasOwn(backup.document.settings,'cg_favorites'));
 assert.ok(!Object.hasOwn(backup.document.settings,'cg_local_free_chargers'));
 assert.ok(backup.warnings.length>=2);
 assert.deepEqual([...storage.values],before);
});

test('import validates format, version, date, keys and size before any restoration',()=>{
 const good=documentFor({cg_soc:75});
 for(const data of [{...good,format:'other-app'},{...good,version:2},{...good,createdAt:'unknown'},{...good,settings:{REVE_API_KEY:'fixture'}},{...good,settings:{cg_geo_photon_v1_ES_madrid:{coords:[1,2]}}},{...good,settings:null}])assert.throws(()=>parsePersonalBackup(JSON.stringify(data)));
 assert.throws(()=>parsePersonalBackup('{'));
 assert.equal(MAX_PERSONAL_BACKUP_BYTES,2*1024*1024);
 assert.throws(()=>parsePersonalBackup(' '.repeat(MAX_PERSONAL_BACKUP_BYTES)+JSON.stringify(good)),/tama|grande|MB|límite/i);
});

test('import rejects invalid coordinates, incompatible structures and out-of-range personal values',()=>{
 for(const settings of [{cg_favorites:null},{cg_favorites:[7]},{cg_local_free_chargers:{}},{cg_local_free_chargers:[{...point,lat:91}]},{cg_local_free_chargers:[{...point,lng:-181}]},{cg_soc:-1},{cg_soc:101},{cg_reserve:51},{cg_connectors:['invented']},{cg_operator_mode:'invented'},{cg_vehicle_profiles_v2:{bad:{...profile,battery:-1}}},{cg_cost_simulator_v1:{costKwh:30,costFixed:-1,costMinutes:30,costPerMinute:0,costSort:'asc',costSearch:'',costVerifiedOnly:false}}])assert.throws(()=>parse(settings),JSON.stringify(settings));
});

test('prototype-shaped keys cannot enter the application settings or profile dictionaries',()=>{
 const prefix='{"format":"cargagratis-personal-data","version":1,"createdAt":"2026-11-14T12:00:00.000Z","settings":';
 for(const settings of ['{"__proto__":{"polluted":true}}','{"cg_vehicle_profiles_v2":{"__proto__":{"battery":57.5,"consumption":17,"maxCharge":170,"maxAc":11}}}','{"cg_vehicle_connectors":{"constructor":["CCS"]}}'])assert.throws(()=>parsePersonalBackup(prefix+settings+'}'));
 assert.equal({}.polluted,undefined);
});

test('a forged personal point cannot certify a free tariff, availability or official provenance',()=>{
 const forged={...point,price:0,source:'REVE oficial',verified:'Confirmado',availability:'Disponible',sourceUrl:'https://example.org/?api_key=fixture-private',dataProvider:{name:'Official',license:'Verified'},connectors:[{type:'CCS',powerKw:400}],apiKey:'fixture-private'};
 const document=parse({cg_local_free_chargers:[forged]});
 const restored=document.settings.cg_local_free_chargers[0];
 assert.deepEqual(restored,point);
 assert.ok(!JSON.stringify(document).includes('fixture-private'));
 assert.ok(!Object.hasOwn(restored,'availability'));
 assert.ok(!Object.hasOwn(restored,'dataProvider'));
 assert.equal(restored.price,null);
});

test('all supported saved settings round-trip without losing the cost simulation or either vehicle profile',()=>{
 const settings={cg_favorites:['local-123'],cg_local_free_chargers:[point],cg_vehicle_profiles_v2:{'Tesla Model Y Standard Range':profile,'Renault Zoe R90':{battery:41,consumption:16,maxCharge:0,maxAc:22}},cg_vehicle_connectors:{'Tesla Model Y Standard Range':['CCS','Tipo2'],'Renault Zoe R90':['Tipo2']},cg_connectors:['CCS','Tipo2'],cg_connector:'Tipo2',cg_vehicle_name:'Tesla Model Y Standard Range',cg_battery_kwh:57.5,cg_consumption_kwh:17,cg_max_charge_kw:170,cg_max_ac_kw:11,cg_soc:77,cg_reserve:15,cg_max_power:350,cg_operator_mode:'custom',cg_selected_operators:['Electra','Fastned'],cg_tesla_rate:.41,cg_unknown_rate:0,cg_cost_simulator_v1:{costKwh:42,costFixed:1.5,costMinutes:20,costPerMinute:.05,costSort:'desc',costSearch:'Electra',costVerifiedOnly:true}};
 assert.deepEqual(Object.keys(settings).sort(),[...PERSONAL_DATA_KEYS].sort());
 const original=memoryStorage();
 for(const [key,value]of Object.entries(settings))assert.equal(savePersonalSetting(key,value,original),true,key);
 const exported=createPersonalBackup(original,new Date('2026-11-14T12:00:00Z'));
 const parsed=parsePersonalBackup(JSON.stringify(exported.document));
 const restored=memoryStorage();
 restorePersonalBackup(parsed,restored);
 assert.deepEqual([...restored.values].sort(),[...original.values].sort());
 assert.deepEqual(parsed.settings,settings);
});

test('restoration only changes included personal keys and preserves caches and other saved settings',()=>{
 const storage=memoryStorage({cg_favorites:'["old"]',cg_reserve:'20',cg_geo_photon_v1_ES_madrid:'cache',unrelated:'keep'});
 const document=parse({cg_favorites:['local-123'],cg_local_free_chargers:[point],cg_soc:78});
 restorePersonalBackup(document,storage);
 assert.deepEqual(JSON.parse(storage.getItem('cg_favorites')),['local-123']);
 assert.deepEqual(JSON.parse(storage.getItem('cg_local_free_chargers')),[point]);
 assert.equal(storage.getItem('cg_soc'),'78');
 assert.equal(storage.getItem('cg_reserve'),'20');
 assert.equal(storage.getItem('cg_geo_photon_v1_ES_madrid'),'cache');
 assert.equal(storage.getItem('unrelated'),'keep');
 assert.equal(JSON.parse(storage.getItem('cg_local_free_chargers'))[0].price,null);
});

test('a write failure rolls back changed values and removes keys newly created by the attempted import',()=>{
 const storage=memoryStorage({cg_soc:'61',cg_favorites:'["old"]',unrelated:'keep'});
 const before=[...storage.values];
 const setItem=storage.setItem;let fail=true;
 storage.setItem=(key,value)=>{if(key==='cg_soc'&&fail){fail=false;throw new DOMException('Full','QuotaExceededError');}return setItem(key,value);};
 const document=parse({cg_local_free_chargers:[point],cg_favorites:['new'],cg_soc:80});
 assert.throws(()=>restorePersonalBackup(document,storage));
 assert.deepEqual([...storage.values].sort(),before.sort());
});

test('invalid or unreadable restoration never writes a partial personal configuration',()=>{
 const storage=memoryStorage({cg_soc:'61'});let writes=0;
 storage.setItem=()=>{writes++;};
 assert.throws(()=>restorePersonalBackup(documentFor({cg_soc:90,cg_favorites:null}),storage));
 assert.equal(writes,0);
 const denied={getItem(){throw new DOMException('Blocked','SecurityError');},setItem(){writes++;},removeItem(){writes++;}};
 assert.throws(()=>restorePersonalBackup(documentFor({cg_soc:90}),denied));
 assert.equal(writes,0);
});
