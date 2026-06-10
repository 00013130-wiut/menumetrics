// Unit tests for the CSV parser + sales-row validation (lib/csv.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseSalesCsv, validateSalesRecord } from '../lib/csv.js';

test('parseCsv handles quoted fields with commas', () => {
  const rows = parseCsv('a,b\n"Osh, Plov",12');
  assert.deepEqual(rows[0], ['a', 'b']);
  assert.deepEqual(rows[1], ['Osh, Plov', '12']);
});

test('parseCsv handles escaped quotes', () => {
  const rows = parseCsv('name\n"He said ""hi"""');
  assert.equal(rows[1][0], 'He said "hi"');
});

test('parseSalesCsv finds columns in any order', () => {
  const { records, errors } = parseSalesCsv(
    'quantity,dish_name,date\n5,Lagman,2026-06-09'
  );
  assert.equal(errors.length, 0);
  assert.equal(records.length, 1);
  assert.deepEqual(
    { d: records[0].date, n: records[0].dish_name, q: records[0].quantity },
    { d: '2026-06-09', n: 'Lagman', q: '5' }
  );
});

test('parseSalesCsv reports missing columns', () => {
  const { errors } = parseSalesCsv('date,quantity\n2026-06-09,5');
  assert.ok(errors.some((e) => /dish_name/.test(e)));
});

test('validateSalesRecord accepts a good row', () => {
  assert.equal(
    validateSalesRecord({ date: '2026-06-09', dish_name: 'Osh', quantity: '3', _row: 2 }),
    null
  );
});

test('validateSalesRecord rejects bad date, qty and empty name', () => {
  assert.match(
    validateSalesRecord({ date: '09-06-2026', dish_name: 'Osh', quantity: '3', _row: 2 }),
    /date/
  );
  assert.match(
    validateSalesRecord({ date: '2026-06-09', dish_name: 'Osh', quantity: '-1', _row: 2 }),
    /quantity/
  );
  assert.match(
    validateSalesRecord({ date: '2026-06-09', dish_name: '', quantity: '3', _row: 2 }),
    /dish_name/
  );
});
