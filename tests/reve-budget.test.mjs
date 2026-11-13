import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {reserveReveBudget} from '../scripts/reserve-reve-budget.mjs';
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cg-reve-budget-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {file:path.join(dir,'state/budget.json'),output:path.join(dir,'output')};}

test('a second runner restored from the reservation cannot make requests until a full hour',t=>{
 const opts=fixture(t),now=Date.parse('2026-11-13T10:59:00Z');
 assert.equal(reserveReveBudget({...opts,now}).allowed,true);
 const saved=fs.readFileSync(opts.file,'utf8');
 // Crossing the wall-clock hour is insufficient: reserve a rolling full hour.
 assert.equal(reserveReveBudget({...opts,now:now+60000}).allowed,false);
 assert.equal(reserveReveBudget({...opts,now:now+3599999}).allowed,false);
 assert.equal(fs.readFileSync(opts.file,'utf8'),saved);
 assert.equal(reserveReveBudget({...opts,now:now+3600000}).allowed,true);
 assert.equal(JSON.parse(fs.readFileSync(opts.file)).lastAttempt,now+3600000);
 assert.equal(fs.readFileSync(opts.output,'utf8'),'allowed=true\nallowed=false\nallowed=false\nallowed=true\n');
});

test('a failed subsequent build does not release an already saved reservation',t=>{
 const opts=fixture(t),now=10000000;
 reserveReveBudget({...opts,now});
 const reservation=fs.readFileSync(opts.file);
 // Simulate a different runner recovering the persisted cache after a failure.
 const recovered=path.join(path.dirname(opts.file),'recovered.json');fs.writeFileSync(recovered,reservation);
 assert.equal(reserveReveBudget({file:recovered,now:now+1200000}).allowed,false);
});

test('corrupt or unsupported persisted reservation fails closed',t=>{
 const opts=fixture(t);fs.mkdirSync(path.dirname(opts.file),{recursive:true});
 for(const state of ['{',JSON.stringify({version:2,lastAttempt:0}),JSON.stringify({version:1,lastAttempt:'wrong'}),JSON.stringify({version:1,lastAttempt:-1})]){
  fs.writeFileSync(opts.file,state);
  assert.throws(()=>reserveReveBudget({...opts,now:10000000}));
  assert.equal(fs.readFileSync(opts.file,'utf8'),state);
  assert.equal(fs.existsSync(opts.output),false);
 }
});

test('clock rollback conserves the reservation instead of reopening the budget',t=>{
 const opts=fixture(t);reserveReveBudget({...opts,now:10000000});
 assert.equal(reserveReveBudget({...opts,now:9999999}).allowed,false);
});
