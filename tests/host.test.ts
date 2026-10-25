import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseLevelParam } from '../src/host.ts';

test('?level=N is a 1-based level index, ignored when out of range', () => {
  assert.equal(parseLevelParam('?level=1', 8), 0);
  assert.equal(parseLevelParam('?level=8', 8), 7);
  assert.equal(parseLevelParam('?level=9', 8), null);
  assert.equal(parseLevelParam('?level=0', 8), null);
  assert.equal(parseLevelParam('?level=2.5', 8), null);
  assert.equal(parseLevelParam('?touch', 8), null);
  assert.equal(parseLevelParam('?stall=3', 8, 'stall'), 2);
});
