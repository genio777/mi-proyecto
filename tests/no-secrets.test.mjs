import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('la publicación rechaza una credencial en archivos públicos sin revelarla', () => {
  const script = path.resolve('scripts/assert-no-secrets.mjs');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-secret-check-'));
  const secret = 'synthetic-test-credential-1234';
  const run = () => spawnSync(process.execPath, [script], {
    cwd, env:{...process.env, REVE_API_KEY:secret}, encoding:'utf8'
  });
  try {
    fs.mkdirSync(path.join(cwd, 'dist/data'), {recursive:true});
    fs.writeFileSync(path.join(cwd, 'dist/data/cache.json'), secret);
    const rejected = run();
    assert.notEqual(rejected.status, 0);
    assert(!rejected.stdout.includes(secret) && !rejected.stderr.includes(secret));
    fs.writeFileSync(path.join(cwd, 'dist/data/cache.json'), '{}');
    assert.equal(run().status, 0);
  } finally { fs.rmSync(cwd, {recursive:true, force:true}); }
});
