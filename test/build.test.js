import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, onTestFinished, test } from 'vitest';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const vite = path.join(root, 'node_modules/vite/bin/vite.js');

test('committed tubekit.user.js matches a fresh build of src/', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tubekit-build-'));
  onTestFinished(() => fs.rmSync(outDir, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [vite, 'build', '--outDir', outDir], { cwd: root, encoding: 'utf8' });
  expect(result.status, `vite build failed:\n${result.stdout}\n${result.stderr}`).toBe(0);

  const built = fs.readFileSync(path.join(outDir, 'tubekit.user.js'), 'utf8');
  const committed = fs.readFileSync(path.join(root, 'tubekit.user.js'), 'utf8');
  expect(committed === built, 'tubekit.user.js is stale; run `npm run build` and commit the result').toBe(true);
});

test('built script is a plain script without module syntax', () => {
  const committed = fs.readFileSync(path.join(root, 'tubekit.user.js'), 'utf8');
  expect(committed).not.toMatch(/^\s*(import|export)\s/m);
  expect(committed).not.toMatch(/\bimport\s*\(/);
});
