import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyReve} from '../scripts/verify-reve.mjs';
const now=Date.parse('2026-11-13T12:00:00Z');
const key='synthetic-verification-credential';

test('solo verifica en Actions con credencial vigente, sin tocar red en otros casos',async()=>{
  const fetcher=()=>{throw Error('Unexpected network');};
  assert.equal((await verifyReve({key,actions:false,fetcher,now})).status,'actions_required');
  assert.equal((await verifyReve({key:'',actions:true,fetcher,now})).status,'not_configured');
  assert.equal((await verifyReve({key,actions:true,fetcher,now,expiresOn:'2026-01-01'})).status,'expired');
});

test('una respuesta realista valida contrato y potencia sin publicar datos ni clave',async()=>{
  let requests=0;
  const result=await verifyReve({key,actions:true,now,fetcher:async(url,options)=>{
    requests++;
    assert.equal(url.origin,'https://www.mapareve.es');
    assert(!url.href.includes(key));
    assert.equal(options.headers['x-api-key'],key);
    return new Response(JSON.stringify([{id:'private-location-id',country:'ESP',name:'Private name',coordinates:{latitude:'40.4',longitude:'-3.7'},evses:[{connectors:[{id:'private-connector-id',standard:'IEC_62196_T2_COMBO',power_type:'DC',max_electric_power:350000}]}]}]),{status:200});
  }});
  assert.equal(requests,1);
  assert.equal(result.status,'authenticated');
  assert.equal(result.locationsWithExplicitConnectorPower,1);
  assert.equal(result.connectorsWithExplicitPower,1);
  assert(!JSON.stringify(result).includes(key));
  assert(!JSON.stringify(result).includes('private-location-id'));
  assert(!JSON.stringify(result).includes('Private name'));
});

test('distingue rechazo, límite y esquema inválido sin reintentos',async()=>{
  for(const [status,expected] of [[401,'unauthorized'],[403,'unauthorized'],[429,'rate_limited'],[500,'http_error']]){
    let calls=0;
    const result=await verifyReve({key,actions:true,now,fetcher:async()=>{calls++;return new Response('private response',{status});}});
    assert.equal(result.status,expected);assert.equal(calls,1);
  }
  assert.equal((await verifyReve({key,actions:true,now,fetcher:async()=>new Response('{}',{status:200})})).status,'invalid_schema');
  assert.equal((await verifyReve({key,actions:true,now,fetcher:async()=>{throw Error(key);}})).status,'network_error');
});
