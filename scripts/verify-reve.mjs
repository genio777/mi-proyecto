// One inventory request, only from Actions with a repository secret. Never log
// response bodies, locations, headers, exception details or credential values.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assessReveCredential,DEFAULT_REVE_API_KEY_EXPIRES_ON} from './lib/reve-credential.mjs';
import {parseReveLocation} from './lib/reve.mjs';

export async function verifyReve({key=process.env.REVE_API_KEY,expiresOn=process.env.REVE_API_KEY_EXPIRES_ON??DEFAULT_REVE_API_KEY_EXPIRES_ON,actions=process.env.GITHUB_ACTIONS==='true',fetcher=fetch,now=Date.now()}={}) {
  const credential=assessReveCredential({configured:!!key,expiresOn,now});
  const result={checkedAt:new Date(now).toISOString(),status:credential.status,httpStatus:null,requests:0,locationsReceived:0,locationsWithExplicitConnectorPower:0,connectorsWithExplicitPower:0,expiresOn:credential.expiresOn};
  if(!actions) return {...result,status:'actions_required'};
  if(!credential.canRequest) return result;
  const url=new URL('https://www.mapareve.es/api/external/v1/locations');
  url.searchParams.set('page','1');url.searchParams.set('limit','100');url.searchParams.set('only_dynamic_info','false');
  result.requests=1;
  let response;
  try {response=await fetcher(url,{headers:{'x-api-key':key,Accept:'application/json'},signal:AbortSignal.timeout(45000)});}
  catch {return {...result,status:'network_error'};}
  result.httpStatus=response.status;
  if(!response.ok) return {...result,status:response.status===401||response.status===403?'unauthorized':response.status===429?'rate_limited':'http_error'};
  let rows;
  try {rows=await response.json();} catch {return {...result,status:'invalid_schema'};}
  if(!Array.isArray(rows)) return {...result,status:'invalid_schema'};
  result.locationsReceived=rows.length;
  for(const row of rows){
    const normalized=parseReveLocation(row,result.checkedAt);
    if(normalized){result.locationsWithExplicitConnectorPower++;result.connectorsWithExplicitPower+=normalized.connectors.length;}
  }
  return {...result,status:'authenticated'};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])) {
  try {
    const result=await verifyReve();
    const json=JSON.stringify(result);
    if(process.env.REVE_API_KEY&&json.includes(process.env.REVE_API_KEY)) throw Error('Unsafe metadata');
    console.log(json);
    if(process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      '\n### Verificación autenticada REVE\n\nEstado: **'+result.status+'**. HTTP: '+(result.httpStatus??'sin consulta')+'. Solicitudes: '+result.requests+'.\n\n'+
      'Ubicaciones recibidas: '+result.locationsReceived+'. Con potencia explícita por toma: '+result.locationsWithExplicitConnectorPower+'.\n\n'+
      'Esta prueba no renueva la clave ni confirma precios, ocupación o funcionamiento presencial.\n');
    if(result.status!=='authenticated') process.exitCode=1;
  } catch {console.error('REVE verification failed; credential and response details withheld.');process.exitCode=1;}
}
