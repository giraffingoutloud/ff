/**
 * Data Provenance Checker
 * Verifies that all data comes from legitimate sources (canonical CSV + Sleeper API)
 * and is properly calculated by evaluation engines, not hardcoded or simulated
 */

import { improvedCanonicalService } from './improvedCanonicalService';
import { evaluationEngine } from './unifiedEvaluationEngine';

export interface ProvenanceIssue {
  type: 'non_canonical_source' | 'hardcoded_value' | 'placeholder_data' | 'simulated_data' | 'engine_mismatch';
  location: string;
  description: string;
  severity: 'critical' | 'warning';
  details?: any;
}

export class DataProvenanceChecker {
  private issues: ProvenanceIssue[] = [];
  private legitimateDataSources = new Set([
    'canonical_data',
    'sleeper_api',
    'evaluation_engine',
    'auction_engine',
    'ppr_analyzer',
    'advanced_metrics'
  ]);
  
  // Known placeholder/test patterns that indicate fake data
  private placeholderPatterns = [
    /lorem ipsum/i,
    /test data/i,
    /sample player/i,
    /placeholder/i,
    /dummy/i,
    /fake/i,
    /mock/i,
    /example/i,
    /todo/i,
    /fixme/i,
    /xxx/i,
    /\[insert.*\]/i,
    /\{placeholder\}/i
  ];
  
  // Patterns that indicate simulated/generated data
  private simulatedPatterns = [
    /player_\d{3,}/i,  // player_001, player_002, etc.
    /team_[a-z]$/i,    // team_a, team_b, etc.
    /^user\d+$/i,      // user1, user2, etc.
    /^bot_/i,          // bot_something
    /^ai_/i,           // ai_generated
    /random/i,
    /generated/i,
    /simulated/i
  ];
  
  // Common hardcoded values that should come from engines
  private suspiciousHardcodedValues = [
    42,    // Common test value
    69,    // Joke value
    420,   // Joke value
    1337,  // Leet speak
    9999,  // Max placeholder
    123,   // Sequential
    111,   // Repeated digits
    100,   // Round number (suspicious if too common)
    0.5,   // Exactly half
    0.123, // Sequential decimal
  ];

  async checkDataProvenance(): Promise<ProvenanceIssue[]> {
    this.issues = [];
    
    console.log('\n🔍 Checking data provenance...');
    
    // 1. Verify canonical data sources
    await this.verifyCanonicalSources();
    
    // 2. Check for hardcoded values in components
    this.checkForHardcodedValues();
    
    // 3. Scan for placeholder/test data
    this.scanForPlaceholderData();
    
    // 4. Verify evaluation engine usage
    this.verifyEvaluationEngineUsage();
    
    // 5. Check auction value calculations
    this.verifyAuctionValueCalculations();
    
    // 6. Scan for simulated data patterns
    this.scanForSimulatedData();
    
    return this.issues;
  }
  
  private async verifyCanonicalSources(): Promise<void> {
    // Check if canonical data service is properly initialized
    const players = improvedCanonicalService.getAllPlayers();
    
    if (!players || players.length === 0) {
      this.issues.push({
        type: 'non_canonical_source',
        location: 'canonicalDataService',
        description: 'No players loaded from canonical sources',
        severity: 'critical'
      });
      return;
    }
    
    // Verify each player has required canonical fields
    const requiredCanonicalFields = ['id', 'name', 'position', 'team'];
    const missingFieldPlayers: string[] = [];
    
    players.forEach(player => {
      const missing = requiredCanonicalFields.filter(field => !player[field]);
      if (missing.length > 0) {
        missingFieldPlayers.push(player.name || 'Unknown');
      }
    });
    
    if (missingFieldPlayers.length > 0) {
      this.issues.push({
        type: 'non_canonical_source',
        location: 'player_data',
        description: `${missingFieldPlayers.length} players missing canonical fields`,
        severity: 'warning',
        details: { players: missingFieldPlayers.slice(0, 5) }
      });
    }
    
    // Check for data sources that shouldn't exist
    const suspiciousDataFiles = [
      'mockData.json',
      'testPlayers.json',
      'sampleData.json',
      'placeholderData.json',
      'tempData.json'
    ];
    
    // This would need filesystem access to fully verify
    // For now, we'll check if any player data looks suspicious
    const suspiciousPlayers = players.filter((p: any) => 
      this.placeholderPatterns.some(pattern => pattern.test(p.name))
    );
    
    if (suspiciousPlayers.length > 0) {
      this.issues.push({
        type: 'placeholder_data',
        location: 'player_names',
        description: `Found ${suspiciousPlayers.length} players with placeholder names`,
        severity: 'critical',
        details: { players: suspiciousPlayers.map(p => p.name).slice(0, 5) }
      });
    }
  }
  
  private checkForHardcodedValues(): void {
    // Get all players to check their values
    const players = improvedCanonicalService.getAllPlayers();
    
    // Count occurrences of suspicious values
    const valueOccurrences = new Map<number, number>();
    
    players.forEach((player: any) => {
      // Check numeric fields for hardcoded values
      const numericFields = [
        'projectedPoints',
        'auctionValue',
        'adp',
        'cvsScore',
        'age',
        'experience'
      ];
      
      numericFields.forEach(field => {
        const value = player[field];
        if (typeof value === 'number') {
          if (this.suspiciousHardcodedValues.includes(value)) {
            valueOccurrences.set(value, (valueOccurrences.get(value) || 0) + 1);
          }
        }
      });
    });
    
    // Report suspicious patterns
    valueOccurrences.forEach((count, value) => {
      if (count > players.length * 0.05) { // More than 5% of players have this value
        this.issues.push({
          type: 'hardcoded_value',
          location: 'player_stats',
          description: `Suspicious: ${count} players have the exact value ${value}`,
          severity: 'warning',
          details: { value, count, percentage: (count / players.length * 100).toFixed(1) }
        });
      }
    });
    
    // Check for sequential or patterned IDs
    const ids = players.map(p => p.id).filter(id => id);
    const sequentialIds = this.checkForSequentialIds(ids);
    
    if (sequentialIds) {
      this.issues.push({
        type: 'simulated_data',
        location: 'player_ids',
        description: 'Player IDs appear to be sequentially generated',
        severity: 'warning',
        details: { sample: ids.slice(0, 5) }
      });
    }
  }
  
  private scanForPlaceholderData(): void {
    const players = improvedCanonicalService.getAllPlayers();
    
    // Check team names
    const teams = new Set(players.map(p => p.team).filter(t => t));
    const placeholderTeams = Array.from(teams).filter(team => 
      this.placeholderPatterns.some(pattern => pattern.test(team)) ||
      this.simulatedPatterns.some(pattern => pattern.test(team))
    );
    
    if (placeholderTeams.length > 0) {
      this.issues.push({
        type: 'placeholder_data',
        location: 'team_names',
        description: `Found placeholder team names: ${placeholderTeams.join(', ')}`,
        severity: 'critical',
        details: { teams: placeholderTeams }
      });
    }
    
    // Check for "TBD" or similar in critical fields
    const tbdPlayers = players.filter((p: any) => 
      p.name === 'TBD' || 
      p.team === 'TBD' || 
      p.position === 'TBD'
    );
    
    if (tbdPlayers.length > 0) {
      this.issues.push({
        type: 'placeholder_data',
        location: 'player_data',
        description: `Found ${tbdPlayers.length} players with TBD fields`,
        severity: 'warning',
        details: { count: tbdPlayers.length }
      });
    }
  }
  
  private verifyEvaluationEngineUsage(): void {
    // Check if evaluation engine is properly initialized
    const players = improvedCanonicalService.getAllPlayers();
    
    if (!players || players.length === 0) return;
    
    // Sample check: verify CVS scores are calculated, not hardcoded
    const cvsScores = players.map(p => p.cvsScore).filter(score => score !== undefined);
    
    // Check for too many identical CVS scores (indicates hardcoding)
    const scoreFrequency = new Map<number, number>();
    cvsScores.forEach(score => {
      const rounded = Math.round(score * 10) / 10; // Round to 1 decimal
      scoreFrequency.set(rounded, (scoreFrequency.get(rounded) || 0) + 1);
    });
    
    scoreFrequency.forEach((count, score) => {
      if (count > 10 && score !== 0) { // More than 10 players with exact same non-zero score
        this.issues.push({
          type: 'engine_mismatch',
          location: 'cvs_scores',
          description: `${count} players have identical CVS score ${score} (possibly hardcoded)`,
          severity: 'warning',
          details: { score, count }
        });
      }
    });
    
    // Check if evaluations have proper variance (not all same)
    const uniqueScores = new Set(cvsScores.map(s => Math.round(s)));
    if (uniqueScores.size < cvsScores.length * 0.1) { // Less than 10% unique values
      this.issues.push({
        type: 'engine_mismatch',
        location: 'evaluation_engine',
        description: 'CVS scores lack proper variance (possibly not calculated)',
        severity: 'warning',
        details: { 
          totalScores: cvsScores.length,
          uniqueValues: uniqueScores.size 
        }
      });
    }
  }
  
  private verifyAuctionValueCalculations(): void {
    const players = improvedCanonicalService.getAllPlayers();
    
    // Check if auction values follow proper distribution
    const auctionValues = players
      .map(p => p.auctionValue)
      .filter(v => v !== undefined && v > 0);
    
    if (auctionValues.length === 0) {
      this.issues.push({
        type: 'engine_mismatch',
        location: 'auction_values',
        description: 'No auction values found (auction engine not running)',
        severity: 'critical'
      });
      return;
    }
    
    // Check for suspicious patterns in auction values
    const allSameValue = auctionValues.every(v => v === auctionValues[0]);
    if (allSameValue) {
      this.issues.push({
        type: 'hardcoded_value',
        location: 'auction_values',
        description: 'All players have identical auction values',
        severity: 'critical',
        details: { value: auctionValues[0] }
      });
    }
    
    // Check for round numbers only (suspicious)
    const roundNumbersOnly = auctionValues.every(v => v === Math.floor(v));
    const hasProperDistribution = Math.max(...auctionValues) > 50 && Math.min(...auctionValues) < 5;
    
    if (roundNumbersOnly && !hasProperDistribution) {
      this.issues.push({
        type: 'engine_mismatch',
        location: 'auction_values',
        description: 'Auction values appear to be simplified/not properly calculated',
        severity: 'warning',
        details: { 
          allRoundNumbers: roundNumbersOnly,
          maxValue: Math.max(...auctionValues),
          minValue: Math.min(...auctionValues)
        }
      });
    }
  }
  
  private scanForSimulatedData(): void {
    const players = improvedCanonicalService.getAllPlayers();
    
    // Check for generated player names
    const simulatedNames = players.filter((p: any) => 
      this.simulatedPatterns.some(pattern => pattern.test(p.name))
    );
    
    if (simulatedNames.length > 0) {
      this.issues.push({
        type: 'simulated_data',
        location: 'player_names',
        description: `Found ${simulatedNames.length} players with simulated name patterns`,
        severity: 'critical',
        details: { 
          count: simulatedNames.length,
          examples: simulatedNames.slice(0, 3).map(p => p.name)
        }
      });
    }
    
    // Check for too-perfect statistical distributions (indicates simulation)
    const projections = players.map((p: any) => p.projectedPoints).filter((p: number) => p > 0);
    if (projections.length > 100) {
      const mean = projections.reduce((a, b) => a + b, 0) / projections.length;
      const variance = projections.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / projections.length;
      const stdDev = Math.sqrt(variance);
      const coefficientOfVariation = stdDev / mean;
      
      // Real data should have CV between 0.3 and 0.8 typically
      if (coefficientOfVariation < 0.1 || coefficientOfVariation > 1.5) {
        this.issues.push({
          type: 'simulated_data',
          location: 'projections',
          description: 'Statistical distribution suggests simulated data',
          severity: 'warning',
          details: { 
            coefficientOfVariation: coefficientOfVariation.toFixed(3),
            expected: '0.3 - 0.8'
          }
        });
      }
    }
  }
  
  private checkForSequentialIds(ids: string[]): boolean {
    if (ids.length < 10) return false;
    
    // Check if IDs are sequential numbers
    const numericIds = ids
      .map(id => parseInt(id))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b);
    
    if (numericIds.length < ids.length * 0.8) return false;
    
    // Check if they're sequential
    let sequential = true;
    for (let i = 1; i < Math.min(10, numericIds.length); i++) {
      if (numericIds[i] !== numericIds[i-1] + 1) {
        sequential = false;
        break;
      }
    }
    
    return sequential;
  }
  
  getSummary(): { 
    total: number; 
    critical: number; 
    warnings: number;
    isLegitimate: boolean;
  } {
    const critical = this.issues.filter(i => i.severity === 'critical').length;
    const warnings = this.issues.filter(i => i.severity === 'warning').length;
    
    return {
      total: this.issues.length,
      critical,
      warnings,
      isLegitimate: critical === 0 // Data is legitimate if no critical issues
    };
  }
  
  getIssues(): ProvenanceIssue[] {
    return this.issues;
  }
  
  getCriticalIssues(): ProvenanceIssue[] {
    return this.issues.filter(i => i.severity === 'critical');
  }
}

export const dataProvenanceChecker = new DataProvenanceChecker();