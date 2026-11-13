import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {DEFAULT_REVE_API_KEY_EXPIRES_ON,assessReveCredential} from '../scripts/lib/reve-credential.mjs';
import {checkReveCredential} from '../scripts/check-reve-credential.mjs';

const day=86400000;
const expiresOn='2027-10-29';
// This date remains in CEST: the next Madrid midnight is 22:00 UTC.
const expiresAt=Date.parse('2027-10-29T22:00:00Z');
const expiryDayNoon=Date.parse('2027-10-29T12:00:00Z');
const credentialInfo={configured:true,expiresOn};
const fakeKey='FAKE_REVE_KEY_TEST_ONLY_9a48f573';

test('REVE expiry defaults to the recorded date without requiring a credential value',()=>{
 assert.equal(DEFAULT_REVE_API_KEY_EXPIRES_ON,expiresOn);
 const report=assessReveCredential({configured:true,now:Date.parse('2026-11-13T12:00:00Z')});
 assert.equal(report.status,'valid');
 assert.equal(report.canRequest,true);
 assert.equal(report.expiresOn,expiresOn);
 assert.equal(report.expiresAt,new Date(expiresAt).toISOString());
 assert.equal(report.automaticRenewalSupported,false);
 assert.equal(report.renewalUrl,'https://www.mapareve.es/api-contacto');
});

for(const [daysRemaining,status,warningThresholdDays] of [
 [61,'valid',null],[60,'expiring',60],[31,'expiring',60],
 [30,'expiring',30],[8,'expiring',30],[7,'expiring',7],[1,'expiring',7],[0,'expiring',7]
]){
 test('REVE credential warning at '+daysRemaining+' remaining Madrid calendar days',()=>{
  const report=assessReveCredential({...credentialInfo,now:expiryDayNoon-daysRemaining*day});
  assert.equal(report.status,status);
  assert.equal(report.daysRemaining,daysRemaining);
  assert.equal(report.warningThresholdDays,warningThresholdDays);
  assert.equal(report.canRequest,true);
 });
}

test('expiry is inclusive through the last millisecond of its Madrid date',()=>{
 const lastMoment=assessReveCredential({...credentialInfo,now:expiresAt-1});
 assert.equal(lastMoment.daysRemaining,0);
 assert.equal(lastMoment.status,'expiring');
 assert.equal(lastMoment.canRequest,true);
 const firstExpiredMoment=assessReveCredential({...credentialInfo,now:expiresAt});
 assert.equal(firstExpiredMoment.status,'expired');
 assert.equal(firstExpiredMoment.canRequest,false);
 const later=assessReveCredential({...credentialInfo,now:expiresAt+90*day});
 assert.equal(later.status,'expired');
 assert.equal(later.canRequest,false);
});

test('the 60-day warning changes at local midnight, not a rolling 24-hour interval',()=>{
 const thresholdDate=new Date(expiryDayNoon-60*day).toISOString().slice(0,10);
 const madridMidnight=Date.parse(thresholdDate+'T00:00:00+02:00');
 const before=assessReveCredential({...credentialInfo,now:madridMidnight-1});
 const boundary=assessReveCredential({...credentialInfo,now:madridMidnight});
 assert.equal(before.daysRemaining,61);
 assert.equal(before.status,'valid');
 assert.equal(boundary.daysRemaining,60);
 assert.equal(boundary.warningThresholdDays,60);
});

for(const invalid of ['','2027-02-29','2027-04-31','2027-13-01','2027-00-10','2027-10-32','2027-2-9','29/10/2027','2027-10-29T23:59:59Z']){
 test('invalid expiry cannot authorize REVE requests: '+JSON.stringify(invalid),()=>{
  const report=assessReveCredential({configured:true,expiresOn:invalid,now:Date.parse('2026-11-13T00:00:00Z')});
  assert.equal(report.status,'invalid_expiry');
  assert.equal(report.canRequest,false);
  assert.equal(report.daysRemaining,null);
 });
}

test('a real leap day is valid',()=>{
 const report=assessReveCredential({configured:true,expiresOn:'2028-02-29',now:Date.parse('2028-02-29T22:59:59Z')});
 assert.equal(report.status,'expiring');
 assert.equal(report.canRequest,true);
 assert.equal(report.daysRemaining,0);
});

test('spring DST counts Madrid calendar dates without assuming 24-hour days',()=>{
 for(const now of ['2027-03-27T23:30:00Z','2027-03-28T21:30:00Z']){
  const report=assessReveCredential({configured:true,expiresOn:'2027-04-01',now:Date.parse(now)});
  assert.equal(report.daysRemaining,4,now);
 }
 const nextDate=assessReveCredential({configured:true,expiresOn:'2027-04-01',now:Date.parse('2027-03-28T22:00:00Z')});
 assert.equal(nextDate.daysRemaining,3);
});

test('autumn DST keeps the complete 25-hour Madrid expiry day valid',()=>{
 for(const now of ['2027-10-30T22:30:00Z','2027-10-31T22:30:00Z']){
  const report=assessReveCredential({configured:true,expiresOn:'2027-10-31',now:Date.parse(now)});
  assert.equal(report.daysRemaining,0,now);
  assert.equal(report.canRequest,true,now);
  assert.equal(report.expiresAt,'2027-10-31T23:00:00.000Z');
 }
 const nextDate=assessReveCredential({configured:true,expiresOn:'2027-10-31',now:Date.parse('2027-10-31T23:00:00Z')});
 assert.equal(nextDate.status,'expired');
 assert.equal(nextDate.canRequest,false);
});

test('absence of an Actions secret never authorizes a request',()=>{
 const report=assessReveCredential({configured:false,expiresOn,now:expiresAt-day});
 assert.equal(report.status,'not_configured');
 assert.equal(report.configured,false);
 assert.equal(report.canRequest,false);
 assert.equal(report.automaticRenewalSupported,false);
 assert.equal(report.expiresOn,expiresOn);
 assert.equal(report.daysRemaining,0);
});

async function withOutputFiles(verify){
 const dir=await mkdtemp(join(tmpdir(),'cargagratis-reve-credential-'));
 try{await verify({dir,output:join(dir,'github-output'),summary:join(dir,'github-summary')})}
 finally{await rm(dir,{recursive:true,force:true})}
}

test('credential check emits only metadata to JSON, GitHub outputs, summary and warnings',async()=>{
 await withOutputFiles(async({output,summary})=>{
  const logs=[],warnings=[];
  const report=await checkReveCredential({...credentialInfo,now:expiryDayNoon-7*day,output,summary,log:message=>logs.push(message),warn:message=>warnings.push(message)});
  const outputText=await readFile(output,'utf8');
  const summaryText=await readFile(summary,'utf8');
  assert.match(outputText,/credential_status=expiring/);
  assert.match(outputText,/can_request=true/);
  assert.match(outputText,/expires_on=2027-10-29/);
  assert.match(outputText,/days_remaining=7/);
  assert.match(outputText,/warning_threshold_days=7/);
  assert.match(summaryText,/2027-10-29/);
  const all=JSON.stringify({report,logs,warnings,outputText,summaryText});
  assert.equal(all.includes(fakeKey),false);
  assert.equal(all.includes('x-api-key'),false);
  assert.equal(JSON.parse(logs[0]).status,'expiring');
  assert.ok(warnings.length>0,'An expiring key should produce a warning');
 });
});

test('strict CLI fails after writing safe expiry metadata when a fake key has expired',async()=>{
 await withOutputFiles(async({output,summary})=>{
  const script=fileURLToPath(new URL('../scripts/check-reve-credential.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[script,'--strict'],{encoding:'utf8',env:{...process.env,REVE_API_KEY:fakeKey,REVE_API_KEY_EXPIRES_ON:'2000-01-01',GITHUB_OUTPUT:output,GITHUB_STEP_SUMMARY:summary}});
  assert.equal(result.status,1,result.stderr);
  const outputText=await readFile(output,'utf8');
  const summaryText=await readFile(summary,'utf8');
  assert.match(outputText,/credential_status=expired/);
  assert.match(outputText,/can_request=false/);
  assert.equal((result.stdout+result.stderr+outputText+summaryText).includes(fakeKey),false);
 });
});

test('CLI with a fake environment credential writes metadata without exposing the value',async()=>{
 await withOutputFiles(async({output,summary})=>{
  const script=fileURLToPath(new URL('../scripts/check-reve-credential.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[script],{encoding:'utf8',env:{...process.env,REVE_API_KEY:fakeKey,REVE_API_KEY_EXPIRES_ON:'2000-01-01',REVE_REQUIRE_KEY:'false',GITHUB_OUTPUT:output,GITHUB_STEP_SUMMARY:summary}});
  assert.equal(result.status,0,result.stderr);
  const outputText=await readFile(output,'utf8');
  const summaryText=await readFile(summary,'utf8');
  assert.match(outputText,/credential_status=expired/);
  assert.match(outputText,/can_request=false/);
  assert.match(outputText,/expires_on=2000-01-01/);
  assert.equal((result.stdout+result.stderr+outputText+summaryText).includes(fakeKey),false);
  assert.equal((result.stdout+result.stderr+outputText+summaryText).includes('x-api-key'),false);
 });
});

test('strict environment mode reports a missing Actions secret without making a request',async()=>{
 await withOutputFiles(async({output,summary})=>{
  const script=fileURLToPath(new URL('../scripts/check-reve-credential.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[script],{encoding:'utf8',env:{...process.env,REVE_API_KEY:'',REVE_API_KEY_EXPIRES_ON:'2027-10-29',REVE_REQUIRE_KEY:'true',GITHUB_OUTPUT:output,GITHUB_STEP_SUMMARY:summary}});
  assert.equal(result.status,1,result.stderr);
  const outputText=await readFile(output,'utf8');
  const summaryText=await readFile(summary,'utf8');
  assert.match(outputText,/credential_status=not_configured/);
  assert.match(outputText,/can_request=false/);
  assert.match(summaryText,/REVE_API_KEY/);
 });
});

test('an invalid expiry cannot inject Actions output or expose an arbitrary secret value',async()=>{
 await withOutputFiles(async({output,summary})=>{
  const logs=[],warnings=[];
  const report=await checkReveCredential({configured:true,expiresOn:'2027-10-29\ncan_request=true\n'+fakeKey,now:expiryDayNoon,output,summary,log:message=>logs.push(message),warn:message=>warnings.push(message)});
  const outputText=await readFile(output,'utf8');
  const summaryText=await readFile(summary,'utf8');
  assert.equal(report.status,'invalid_expiry');
  assert.match(outputText,/credential_status=invalid_expiry/);
  assert.match(outputText,/can_request=false/);
  assert.equal(outputText.includes('can_request=true'),false);
  assert.equal(JSON.stringify({report,logs,warnings,outputText,summaryText}).includes(fakeKey),false);
 });
});
