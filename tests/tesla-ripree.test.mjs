import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {auditTeslaCatalog} from '../scripts/import-tesla.mjs';

test('Tesla site maximum cannot turn an official AC socket into CCS',()=>{
 const ac={id:'official',name:'Tesla',source:'DGT MITERD REVE',power:11,connector:'Tipo2',connectors:[{type:'Tipo2',powerKw:11,price:null}],price:null};
 const unknown={id:'legacy',name:'Tesla',source:'Tesla Superchargers - Niek community dataset',power:250,connector:'CCS',price:null};
 const result=auditTeslaCatalog({chargers:[structuredClone(ac),unknown]});
 assert.deepEqual(result.chargers,[ac]);
 assert.equal(result.teslaSourceAudit.removedUnlicensed,1);
});

test('legacy site rating is repaired from existing sockets without raising their ratings',()=>{
 const result=auditTeslaCatalog({chargers:[{id:'official',name:'Tesla',source:'DGT MITERD REVE',power:250,powerSource:'Tesla Superchargers - Niek community dataset',connector:'Tipo2, CCS',connectors:[{type:'Tipo2',powerKw:11,price:null}],price:null}]});
 assert.equal(result.chargers[0].power,11);
 assert.equal(result.chargers[0].connector,'Tipo2');
 assert.deepEqual(result.chargers[0].connectors,[{type:'Tipo2',powerKw:11,price:null}]);
 assert.equal(result.chargers[0].price,null);
});

test('RIPREE keeps site ratings separate and distinguishes CCS formats',()=>{
 const script=fileURLToPath(new URL('../scripts/import-miteco-ripree.py',import.meta.url));
 const result=spawnSync('python3',['-c',`
import importlib.util,sys
spec=importlib.util.spec_from_file_location('ripree',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
assert m.num('NaN') is None and m.num('Infinity') is None
assert m.num('1.234,5')==1234.5
row={'conectores':'CCS2, Tipo 2','potencia (kw)':'250'}
raw,labels,sockets=m.connector_fields(row)
assert labels==['CCS','Tipo2'] and sockets==[],(labels,sockets)
raw,labels,sockets=m.connector_fields({'conector':'CCS1','potencia conector (kw)':'120'})
assert labels==['CCS1'] and sockets[0]['type']=='CCS1' and sockets[0]['powerKw']==120
assert m.connector_fields({'conector':'CCS','potencia conector (kw)':'120'})[2]==[]
assert m.connector_fields({'conector':'IEC 62196 T2 COMBO','potencia conector (kw)':'350'})[1:]==(['CCS'],[{'type':'CCS','powerKw':350.0,'price':None,'powerType':'DC','officialConnectorId':None}])
`,script],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
