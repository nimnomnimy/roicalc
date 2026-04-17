import type { Currency } from '../types/models';

let currentBaseCurrency: Currency = 'AUD';

export function setDisplayCurrency(c: Currency) {
  currentBaseCurrency = c;
}

export function formatCurrency(value: number, compact = false): string {
  return formatInCurrency(value, currentBaseCurrency, compact);
}

export function formatInCurrency(value: number, currency: Currency, compact = false): string {
  const symbol = currency === 'USD' ? 'US$' : 'A$';
  if (compact) {
    if (Math.abs(value) >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `${symbol}${(value / 1_000).toFixed(0)}K`;
  }
  const locale = currency === 'USD' ? 'en-US' : 'en-AU';
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}
