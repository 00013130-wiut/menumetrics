// Minimal CSV parser supporting quoted fields, escaped quotes ("") and
// commas/newlines inside quotes. Returns an array of string arrays (rows).
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const s = String(text).replace(/\r\n?/g, '\n');

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  // last field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // drop fully-empty rows
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// Parse a sales CSV with a header containing date, dish_name, quantity (in any
// order). Returns { records: [{date, dish_name, quantity, _row}], errors: [] }.
export function parseSalesCsv(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return { records: [], errors: ['File is empty.'] };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const di = header.indexOf('date');
  const ni = header.findIndex((h) => h === 'dish_name' || h === 'dish');
  const qi = header.findIndex((h) => h === 'quantity' || h === 'qty');

  const errors = [];
  if (di === -1) errors.push("Missing 'date' column.");
  if (ni === -1) errors.push("Missing 'dish_name' column.");
  if (qi === -1) errors.push("Missing 'quantity' column.");
  if (errors.length) return { records: [], errors };

  const records = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const date = (cells[di] || '').trim();
    const dish_name = (cells[ni] || '').trim();
    const quantity = (cells[qi] || '').trim();
    records.push({ date, dish_name, quantity, _row: r + 1 });
  }
  return { records, errors: [] };
}

// Validate a single parsed record. Returns an error string or null.
export function validateSalesRecord(rec) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rec.date))
    return `row ${rec._row}: date must be YYYY-MM-DD`;
  const d = new Date(rec.date);
  if (Number.isNaN(d.getTime())) return `row ${rec._row}: invalid date`;
  if (!rec.dish_name) return `row ${rec._row}: dish_name is empty`;
  const q = Number(rec.quantity);
  if (!Number.isInteger(q) || q <= 0)
    return `row ${rec._row}: quantity must be a positive whole number`;
  return null;
}
