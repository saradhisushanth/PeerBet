/** Coin symbol used for in-app balance, stakes, profit, etc. */
export const COIN_SYMBOL = "💰";

/** Rupee symbol used for prize pool (contributions, total pool, payouts). */
export const RUPEES_SYMBOL = "₹";

/** Format a number with comma thousands (e.g. 1,000 · 10,000). Optional decimals. */
export function formatNumber(n: number, decimals = 0): string {
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Format as amount with coin symbol (e.g. 💰 1,000). Use for balance, stakes, profit, etc. */
export function formatCurrency(n: number, decimals = 0): string {
  return `${COIN_SYMBOL} ${formatNumber(n, decimals)}`;
}

/** Format as prize pool amount with rupee symbol (e.g. ₹ 1,000). Use for prize pool contributions, total pool, payouts. */
export function formatPrizePool(n: number, decimals = 0): string {
  return `${RUPEES_SYMBOL} ${formatNumber(n, decimals)}`;
}

/** Format as coins (same as formatCurrency). Kept for compatibility. */
export function formatCoins(n: number, decimals = 0): string {
  return formatCurrency(n, decimals);
}
