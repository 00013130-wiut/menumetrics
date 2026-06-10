// Formatting helpers. Money is in Uzbek so'm by default, but the currency label
// is configurable via the settings table and threaded through where available.

export function formatMoney(value, currency = "so'm") {
  const n = Number(value) || 0;
  return Math.round(n).toLocaleString('en-US') + ' ' + currency;
}

export function formatPct(value, digits = 1) {
  const n = Number(value) || 0;
  return (n * 100).toFixed(digits) + '%';
}

export function formatNumber(value, digits = 0) {
  const n = Number(value) || 0;
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatDate(value) {
  if (!value) return '';
  try {
    const d = new Date(value);
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(value);
  }
}

export function formatDateTime(value) {
  if (!value) return '';
  try {
    const d = new Date(value);
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
}
