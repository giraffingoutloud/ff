/**
 * Safe number formatting utilities to prevent crashes from undefined/NaN/Infinity values
 */

export const safeToFixed = (value: number | undefined | null, decimals: number = 0): string => {
  if (value === undefined || value === null) return '0';
  if (isNaN(value)) return '0';
  if (!isFinite(value)) return '0';
  return value.toFixed(decimals);
};

export const safeRound = (value: number | undefined | null): number => {
  if (value === undefined || value === null) return 0;
  if (isNaN(value)) return 0;
  if (!isFinite(value)) return 0;
  return Math.round(value);
};

export const safeNumber = (value: any, defaultValue: number = 0): number => {
  const num = Number(value);
  if (isNaN(num)) return defaultValue;
  if (!isFinite(num)) return defaultValue;
  return num;
};