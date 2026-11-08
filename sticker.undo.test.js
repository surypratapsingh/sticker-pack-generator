import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { recordEdit, undoEdit, HISTORY_MAX, MERGE_MS } from './sticker.js';

describe('recordEdit', () => {
  it('stores the value a field had before the edit', () => {
    const h = recordEdit([], 'caption', 'Hi', 0);
    assert.deepEqual(h, [{ field: 'caption', value: 'Hi', at: 0 }]);
  });

  it('merges repeated edits to one field into a single step', () => {
    // A slider drag: 40 -> 45 -> 50 -> 55, each step a few ms apart.
    let h = recordEdit([], 'tolerance', 40, 0);
    h = recordEdit(h, 'tolerance', 45, 100);
    h = recordEdit(h, 'tolerance', 50, 200);
    assert.equal(h.length, 1);
    assert.equal(h[0].value, 40); // the value before the whole drag
  });

  it('starts a new step after a pause or when the field changes', () => {
    let h = recordEdit([], 'tolerance', 40, 0);
    h = recordEdit(h, 'tolerance', 50, MERGE_MS); // gap of exactly MERGE_MS: a new step
    assert.equal(h.length, 2);
    h = recordEdit(h, 'outline', 10, MERGE_MS + 10);
    assert.deepEqual(h.map((e) => e.field), ['tolerance', 'tolerance', 'outline']);
  });

  it('keeps only the newest HISTORY_MAX steps', () => {
    let h = [];
    for (let i = 0; i < HISTORY_MAX + 5; i++) h = recordEdit(h, 'caption', `v${i}`, i * 10_000);
    assert.equal(h.length, HISTORY_MAX);
    assert.equal(h[0].value, 'v5');
  });

  it('does not mutate the history it was given', () => {
    const before = [{ field: 'caption', value: 'a', at: 0 }];
    recordEdit(before, 'caption', 'b', 10);
    assert.equal(before.length, 1);
    assert.equal(before[0].at, 0);
  });
});

describe('undoEdit', () => {
  it('returns null when there is nothing to undo', () => {
    assert.equal(undoEdit([]), null);
  });

  it('returns the last step and the rest', () => {
    const h = [{ field: 'a', value: 1, at: 0 }, { field: 'b', value: 2, at: 5 }];
    const r = undoEdit(h);
    assert.deepEqual(r.entry, { field: 'b', value: 2, at: 5 });
    assert.deepEqual(r.rest, [{ field: 'a', value: 1, at: 0 }]);
  });

  it('undoes a merged drag in one go', () => {
    let h = recordEdit([], 'outline', 10, 0);
    h = recordEdit(h, 'outline', 12, 50);
    const r = undoEdit(h);
    assert.equal(r.entry.value, 10);
    assert.deepEqual(r.rest, []);
  });
});
