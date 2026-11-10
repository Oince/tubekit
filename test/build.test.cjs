'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const vite = path.join(root, 'node_modules/vite/bin/vite.js');

test('committed tubekit.user.js matches a fresh build of src/', t => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tubekit-build-'));
  t.after(() => fs.rmSync(outDir, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [vite, 'build', '--outDir', outDir], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `vite build failed:\n${result.stdout}\n${result.stderr}`);

  const built = fs.readFileSync(path.join(outDir, 'tubekit.user.js'), 'utf8');
  const committed = fs.readFileSync(path.join(root, 'tubekit.user.js'), 'utf8');
  assert.equal(committed, built, 'tubekit.user.js is stale; run `npm run build` and commit the result');
});

test('built script is a plain script without module syntax', () => {
  const committed = fs.readFileSync(path.join(root, 'tubekit.user.js'), 'utf8');
  assert.doesNotMatch(committed, /^\s*(import|export)\s/m);
  assert.doesNotMatch(committed, /\bimport\s*\(/);
});
