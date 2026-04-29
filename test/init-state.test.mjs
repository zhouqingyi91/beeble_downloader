import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertInitialized, initStatePath, markInitialized, readInitState } from '../src/init-state.mjs';

test('readInitState returns null before init marker exists', async () => {
  const profileDir = await mkdtemp(path.join(os.tmpdir(), 'beeble-init-missing-'));
  const state = await readInitState({ profileDir });
  assert.equal(state, null);
});

test('markInitialized writes marker consumed by assertInitialized', async () => {
  const profileDir = await mkdtemp(path.join(os.tmpdir(), 'beeble-init-'));
  const paths = { profileDir };
  const written = await markInitialized(paths, { extensionId: 'abc' });
  const read = await assertInitialized(paths);

  assert.equal(read.completedAt, written.completedAt);
  assert.equal(read.extensionId, 'abc');
  assert.equal(path.basename(initStatePath(paths)), 'beeble-init.json');
});

test('assertInitialized rejects when init marker is missing', async () => {
  const profileDir = await mkdtemp(path.join(os.tmpdir(), 'beeble-init-required-'));
  await assert.rejects(
    () => assertInitialized({ profileDir }),
    /请先运行 npm run init/
  );
});
