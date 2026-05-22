import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/cli.mjs';

test('parseArgs keeps legacy extractor mode by default', () => {
  const args = parseArgs([]);

  assert.equal(args.useGenerateDownload, false);
});

test('parseArgs enables generate download mode', () => {
  const args = parseArgs(['--use-generate-download', '--limit', '1']);

  assert.equal(args.useGenerateDownload, true);
  assert.equal(args.limit, 1);
});

test('parseArgs enables source name naming mode', () => {
  const args = parseArgs(['--use-source-name']);

  assert.equal(args.useSourceName, true);
});
