/**
 * Input validation utilities
 */

import { Position, Player } from '../types';

export const isValidPosition = (position: string): position is Position => {
  return ['QB', 'RB', 'WR', 'TE', 'K', 'DST'].includes(position);
};

export const validatePlayer = (player: unknown): player is Player => {
  if (!player || typeof player !== 'object') {
    return false;
  }
  
  const p = player as Record<string, unknown>;
  
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.team === 'string' &&
    isValidPosition(p.position as string) &&
    typeof p.age === 'number' &&
    p.age > 0 &&
    p.age < 100 &&
    typeof p.experience === 'number' &&
    p.experience >= 0 &&
    typeof p.byeWeek === 'number' &&
    typeof p.adp === 'number' &&
    typeof p.projectedPoints === 'number' &&
    typeof p.cvsScore === 'number'
  );
};

export const validateBudget = (amount: number, maxBudget: number): boolean => {
  return amount > 0 && amount <= maxBudget && Number.isInteger(amount);
};

export const validateTeamName = (name: string): boolean => {
  const sanitized = name.trim();
  return sanitized.length > 0 && sanitized.length <= 50 && !/[<>]/.test(sanitized);
};

export const validateSearchQuery = (query: string): string => {
  // Sanitize and validate search input
  const sanitized = query
    .trim()
    .replace(/[^\w\s'-]/g, '') // Keep only alphanumeric, spaces, hyphens, apostrophes
    .substring(0, 100); // Limit length
  
  return sanitized;
};

export const validateApiKey = (key: string): boolean => {
  // Basic API key validation
  return /^[A-Za-z0-9-_]{20,}$/.test(key);
};

export const validateUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
};

export const validatePositiveInteger = (value: unknown): value is number => {
  return typeof value === 'number' && 
         Number.isInteger(value) && 
         value > 0;
};

export const validatePercentage = (value: unknown): value is number => {
  return typeof value === 'number' && 
         value >= 0 && 
         value <= 100;
};

export const validateDateString = (date: string): boolean => {
  const parsed = Date.parse(date);
  return !isNaN(parsed) && parsed > 0;
};