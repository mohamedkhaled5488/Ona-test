export interface Currency {
  code: string;
  symbol: string;
  name: string;
}

export const currencies: Currency[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound' },
  { code: 'SAR', symbol: 'SAR ', name: 'Saudi Riyal' },
  { code: 'AED', symbol: 'AED ', name: 'UAE Dirham' },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CNY', symbol: 'CN¥', name: 'Chinese Yuan' },
];

export function formatMoney(amount: number, currencyCode: string | null | undefined): string {
  const currency = currencies.find((c) => c.code === currencyCode) ?? currencies[0];
  const zeroDecimal = currency.code === 'JPY';
  return `${currency.symbol}${amount.toFixed(zeroDecimal ? 0 : 2)}`;
}
