import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

test('una fuente accesible no renueva la fecha ni los importes de sus tarifas', () => {
  const script=pathToFileURL(path.resolve('scripts/update-tariffs.mjs')).href;
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'cg-tariff-monitor-'));
  const original={updated:'2025-01-01T00:00:00Z',operators:[{id:'repsol',tiers:[{price:0.5}]}]};
  try {
    fs.mkdirSync(path.join(cwd,'public/data'),{recursive:true});
    const file=path.join(cwd,'public/data/operator-tariffs.json');
    fs.writeFileSync(file,JSON.stringify(original));
    const run=spawnSync(process.execPath,['--input-type=module','-e',
      `globalThis.fetch=async()=>({ok:true,status:200});await import(${JSON.stringify(script)});`],{cwd,encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    const actual=JSON.parse(fs.readFileSync(file));
    assert.equal(actual.updated,original.updated);
    assert.deepEqual(actual.operators[0].tiers,original.operators[0].tiers);
    assert.equal(actual.operators[0].sourceReachable,true);
    assert(Number.isFinite(Date.parse(actual.lastSourceCheck)));
  } finally {fs.rmSync(cwd,{recursive:true,force:true});}
});
