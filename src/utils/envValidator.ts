interface EnvConfig {
  YAHOO_CLIENT_ID?: string;
  YAHOO_CLIENT_SECRET?: string;
  ESPN_SWID?: string;
  ESPN_S2?: string;
  SLEEPER_API_BASE: string;
  ENABLE_REALTIME_UPDATES: boolean;
  ENABLE_DATA_VALIDATION: boolean;
}

class EnvValidator {
  private config: EnvConfig | null = null;

  validateAndLoad(): EnvConfig {
    if (this.config) return this.config;

    const missingVars: string[] = [];
    const warnings: string[] = [];

    // Check for Yahoo API credentials (optional but warn if missing)
    const yahooClientId = import.meta.env.VITE_YAHOO_CLIENT_ID;
    const yahooClientSecret = import.meta.env.VITE_YAHOO_CLIENT_SECRET;
    
    if (!yahooClientId || !yahooClientSecret) {
      warnings.push('Yahoo API credentials not configured. Yahoo data fetching will be disabled.');
    }

    // Check for ESPN credentials (optional)
    const espnSwid = import.meta.env.VITE_ESPN_SWID;
    const espnS2 = import.meta.env.VITE_ESPN_S2;
    
    if (!espnSwid || !espnS2) {
      warnings.push('ESPN API credentials not configured. ESPN data fetching will be disabled.');
    }

    // Required: Sleeper API base (has default)
    const sleeperApiBase = import.meta.env.VITE_SLEEPER_API_BASE || 'https://api.sleeper.app/v1';

    // Feature flags with defaults
    const enableRealtimeUpdates = import.meta.env.VITE_ENABLE_REALTIME_UPDATES !== 'false';
    const enableDataValidation = import.meta.env.VITE_ENABLE_DATA_VALIDATION === 'true';

    // Log warnings in development
    if (import.meta.env.DEV && warnings.length > 0) {
      console.warn('⚠️ Environment Configuration Warnings:');
      warnings.forEach(w => console.warn(`  - ${w}`));
      console.warn('Create a .env.local file based on .env.example to configure these features.');
    }

    this.config = {
      YAHOO_CLIENT_ID: yahooClientId,
      YAHOO_CLIENT_SECRET: yahooClientSecret,
      ESPN_SWID: espnSwid,
      ESPN_S2: espnS2,
      SLEEPER_API_BASE: sleeperApiBase,
      ENABLE_REALTIME_UPDATES: enableRealtimeUpdates,
      ENABLE_DATA_VALIDATION: enableDataValidation,
    };

    return this.config;
  }

  get(key: keyof EnvConfig): any {
    if (!this.config) {
      this.validateAndLoad();
    }
    return this.config![key];
  }

  hasYahooCredentials(): boolean {
    if (!this.config) this.validateAndLoad();
    return !!(this.config!.YAHOO_CLIENT_ID && this.config!.YAHOO_CLIENT_SECRET);
  }

  hasEspnCredentials(): boolean {
    if (!this.config) this.validateAndLoad();
    return !!(this.config!.ESPN_SWID && this.config!.ESPN_S2);
  }
}

export const envValidator = new EnvValidator();
export type { EnvConfig };