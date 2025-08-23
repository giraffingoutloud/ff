/**
 * Feature Flags Configuration
 * Allows switching between old CVS system and new Value/Price/Edge system
 */

export interface FeatureFlags {
  useNewEvaluationSystem: boolean;
  showEdgeCalculations: boolean;
  showIntrinsicValue: boolean;
  showMarketPrice: boolean;
  showDebugInfo: boolean;
  enableLeagueCustomization: boolean;
}

// Get flags from localStorage or use defaults
const getStoredFlags = (): Partial<FeatureFlags> => {
  try {
    const stored = localStorage.getItem('ff_feature_flags');
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
};

// Default feature flags
const defaultFlags: FeatureFlags = {
  useNewEvaluationSystem: true,  // Default to new system
  showEdgeCalculations: true,
  showIntrinsicValue: true,
  showMarketPrice: true,
  showDebugInfo: false,
  enableLeagueCustomization: true
};

// Merge stored flags with defaults
export const featureFlags: FeatureFlags = {
  ...defaultFlags,
  ...getStoredFlags()
};

/**
 * Update feature flags and persist to localStorage
 */
export function updateFeatureFlags(updates: Partial<FeatureFlags>): void {
  Object.assign(featureFlags, updates);
  try {
    localStorage.setItem('ff_feature_flags', JSON.stringify(featureFlags));
  } catch (error) {
    console.error('Failed to save feature flags:', error);
  }
}

/**
 * Reset feature flags to defaults
 */
export function resetFeatureFlags(): void {
  Object.assign(featureFlags, defaultFlags);
  try {
    localStorage.removeItem('ff_feature_flags');
  } catch (error) {
    console.error('Failed to reset feature flags:', error);
  }
}

/**
 * Check if new evaluation system is enabled
 */
export function isNewSystemEnabled(): boolean {
  return featureFlags.useNewEvaluationSystem;
}

/**
 * Check if edge calculations should be shown
 */
export function shouldShowEdge(): boolean {
  return featureFlags.useNewEvaluationSystem && featureFlags.showEdgeCalculations;
}

/**
 * Check if debug info should be shown
 */
export function isDebugMode(): boolean {
  return featureFlags.showDebugInfo;
}

/**
 * Get display columns based on feature flags
 */
export function getEnabledColumns(): string[] {
  const columns = ['name', 'position', 'team', 'projectedPoints'];
  
  if (featureFlags.useNewEvaluationSystem) {
    if (featureFlags.showIntrinsicValue) {
      columns.push('intrinsicValue', 'vorp');
    }
    if (featureFlags.showMarketPrice) {
      columns.push('marketPrice', 'priceConfidence');
    }
    if (featureFlags.showEdgeCalculations) {
      columns.push('edge', 'edgePercent', 'recommendation');
    }
  } else {
    // Old system columns
    columns.push('cvsScore', 'auctionValue', 'adp');
  }
  
  return columns;
}

/**
 * Export flags for debugging
 */
export function exportFlags(): string {
  return JSON.stringify(featureFlags, null, 2);
}

/**
 * Import flags from JSON string
 */
export function importFlags(jsonString: string): boolean {
  try {
    const imported = JSON.parse(jsonString);
    updateFeatureFlags(imported);
    return true;
  } catch {
    return false;
  }
}