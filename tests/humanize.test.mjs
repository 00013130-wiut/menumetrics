// Unit tests for the plain-English presentation helpers (lib/humanize.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY_LABEL,
  CATEGORY_MEANING,
  summarySentence,
  dishBlurb,
} from '../lib/humanize.js';

test('CATEGORY_LABEL maps internal keys to friendly display names', () => {
  assert.equal(CATEGORY_LABEL.Star, 'Star');
  assert.equal(CATEGORY_LABEL.Plowhorse, 'Crowd-Pleaser');
  assert.equal(CATEGORY_LABEL.Puzzle, 'Hidden Gem');
  assert.equal(CATEGORY_LABEL.Dog, 'Underperformer');
});

test('CATEGORY_MEANING covers all four categories', () => {
  for (const k of ['Star', 'Plowhorse', 'Puzzle', 'Dog']) {
    assert.ok(typeof CATEGORY_MEANING[k] === 'string' && CATEGORY_MEANING[k].length);
  }
});

test('summarySentence describes a strong, low-waste month', () => {
  const model = {
    grossMargin: 0.65,
    wasteRatio: 0.02,
    totalRevenue: 84000000,
    categoryCounts: { Star: 2, Dog: 1 },
    wasteAnalysis: { byIngredient: [{ name: 'Tomato' }] },
  };
  const s = summarySentence(model, "so'm", 5);
  assert.match(s, /Strong period/);
  assert.match(s, /65/);
});

test('summarySentence prompts for sales when there is no revenue', () => {
  const s = summarySentence(
    { grossMargin: 0, wasteRatio: 0, totalRevenue: 0, categoryCounts: {} },
    "so'm",
    5
  );
  assert.match(s, /Add some sales/);
});

test('dishBlurb returns a sentence naming the dish for each category', () => {
  for (const category of ['Star', 'Plowhorse', 'Puzzle', 'Dog']) {
    const text = dishBlurb({ name: 'Osh', category, grossProfit: 16600 }, "so'm");
    assert.match(text, /Osh/);
  }
});
