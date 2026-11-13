// This command checks local Actions metadata only; it never calls REVE, renews
// credentials, creates issues or sends messages. The key is reduced to presence.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assessReveCredential,DEFAULT_REVE_API_KEY_EXPIRES_ON} from './lib/reve-credential.mjs';
export function checkReveCredential({configured=!!process.env.REVE_API_KEY,expiresOn=process.env.REVE_API_KEY_EXPIRES_ON??DEFAULT_REVE_API_KEY_EXPIRES_ON,now=Date.now(),output=process.env.GITHUB_OUTPUT,summary=process.env.GITHUB_STEP_SUMMARY,requireKey=process.env.REVE_REQUIRE_KEY==='true',log=console.log,warn=console.warn}={}){
 const report=assessReveCredential({configured,expiresOn,now});
 if(output){
  const values={credential_status:report.status,can_request:String(report.canRequest),expires_on:report.expiresOn||'',expires_at:report.expiresAt||'',days_remaining:report.daysRemaining??'',warning_threshold_days:report.warningThresholdDays??''};
  fs.appendFileSync(output,Object.entries(values).map(([key,value])=>key+'='+value+'\n').join(''));
 }
 let notice;
 if(report.status==='not_configured')notice='Falta el secreto de GitHub Actions REVE_API_KEY. Se conserva el catálogo en caché.';
 else if(report.status==='invalid_expiry')notice='La fecha de caducidad REVE no es válida. Las consultas autenticadas están bloqueadas; se conserva la caché.';
 else if(report.status==='expired')notice='La credencial REVE ha caducado. Las consultas autenticadas están bloqueadas; se conserva la caché.';
 else if(report.warningThresholdDays!==null)notice='La credencial REVE caduca en '+report.daysRemaining+' día(s) de calendario. Aviso de '+report.warningThresholdDays+' días.';
 else notice='La fecha de caducidad configurada permite las consultas; una revocación anticipada puede producir HTTP 401/403.';
 if(summary){
  const lines=['### Credencial REVE','',notice,'',report.expiresOn?'Fecha comunicada por el titular: **'+report.expiresOn+'**, inclusive en **'+report.timeZone+'**.':'Fecha de caducidad: no válida.','', 'Renovación automática: no hay un procedimiento público documentado. Solicitarla en [REVE]('+report.renewalUrl+'), actualizar el secreto en GitHub Actions y cambiar la fecha configurada tras recibir confirmación.',''];
  fs.appendFileSync(summary,lines.join('\n'));
 }
 log(JSON.stringify(report));
 if(report.status!=='valid')warn('::warning title=Credencial REVE::'+notice);
 if(requireKey&&!report.canRequest)throw Error('REVE credential check blocked: '+report.status);
 return report;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 try{checkReveCredential({requireKey:process.argv.includes('--strict')||process.env.REVE_REQUIRE_KEY==='true'});}
 catch{console.error('REVE credential check failed; inspect the safe status summary.');process.exitCode=1;}
}
