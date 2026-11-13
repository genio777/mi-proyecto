// Reserve a complete hourly REVE request budget before making any API request.
// GitHub Actions restores this file and saves a new cache entry BEFORE running
// import-reve.mjs. Saving failure must stop the job. No credential is stored here.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function reserveReveBudget({file=process.env.REVE_BUDGET_PATH||'.state/reve-budget.json',now=Date.now(),output=process.env.GITHUB_OUTPUT}={}) {
 if(!Number.isFinite(now)||now<0)throw Error('Invalid REVE budget clock');
 let prior=null;
 if(fs.existsSync(file)){
  // Corrupt state fails closed instead of resetting an unknown request budget.
  prior=JSON.parse(fs.readFileSync(file,'utf8'));
  if(prior?.version!==1||!Number.isFinite(prior.lastAttempt)||prior.lastAttempt<0)throw Error('Invalid REVE request-budget state; no requests authorized');
 }
 const allowed=!prior||now-prior.lastAttempt>=3600000;
 if(allowed){
  const state={version:1,lastAttempt:now};
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temporary=file+'.tmp';fs.writeFileSync(temporary,JSON.stringify(state));fs.renameSync(temporary,file);
 }
 if(output)fs.appendFileSync(output,'allowed='+String(allowed)+'\n');
 return {allowed,lastAttempt:allowed?now:prior.lastAttempt};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))console.log('REVE request budget:',reserveReveBudget().allowed?'reserved; save state before requesting':'already reserved; use cached inventory');
