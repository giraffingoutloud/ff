/**
 * Batched State Hook
 * Batches multiple state updates within the same event loop to prevent multiple re-renders
 */

import { useState, useCallback, useRef } from 'react';

export function useBatchedState<T>(initialValue: T): [T, (updater: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(initialValue);
  const pendingUpdate = useRef<T | null>(null);
  const updateTimer = useRef<NodeJS.Timeout | null>(null);
  
  const batchedSetState = useCallback((updater: T | ((prev: T) => T)) => {
    // Clear any existing timer
    if (updateTimer.current) {
      clearTimeout(updateTimer.current);
    }
    
    // Calculate new value
    const newValue = typeof updater === 'function' 
      ? (updater as (prev: T) => T)(pendingUpdate.current ?? state)
      : updater;
    
    pendingUpdate.current = newValue;
    
    // Batch the update
    updateTimer.current = setTimeout(() => {
      setState(pendingUpdate.current as T);
      pendingUpdate.current = null;
    }, 0);
  }, [state]);
  
  return [state, batchedSetState];
}