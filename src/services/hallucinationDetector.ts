/**
 * Hallucination Detection Service
 * Detects impossible, suspicious, or likely AI-generated incorrect data patterns
 * that might indicate data corruption or generation errors
 */

export interface HallucinationIssue {
  type: 'impossible_stat' | 'duplicate_player' | 'name_pattern' | 'stat_outlier' | 'missing_required' | 'impossible_combination';
  playerId?: string;
  playerName?: string;
  description: string;
  confidence: 'high' | 'medium' | 'low'; // How confident we are this is a hallucination
  details: any;
}

export class HallucinationDetector {
  private issues: HallucinationIssue[] = [];
  
  // Known valid player name patterns
  private readonly validSuffixes = ['Jr', 'Jr.', 'III', 'II', 'Sr', 'Sr.', 'IV', 'V'];
  
  // Statistical impossibilities
  private readonly IMPOSSIBLE_PATTERNS = {
    // Receiving
    MAX_CATCH_RATE: 1.0,
    MAX_RECEPTIONS_PER_GAME: 15, // NFL record is ~13
    MAX_TARGETS_PER_GAME: 20,
    
    // Rushing
    MAX_YPC: 10.0, // Career YPC above 10 is virtually impossible
    MAX_RUSHING_TDS: 30, // Single season record is 28
    
    // Passing  
    MAX_COMPLETION_PCT: 0.80, // 80% for a season is extreme
    MAX_PASSING_TDS: 60, // Single season record is 55
    MAX_QB_RUSHING_TDS: 15,
    
    // General
    MAX_PROJECTED_POINTS: 500, // Even best QB barely reaches 400
    MIN_PROJECTED_POINTS: -10, // Negative points impossible
    
    // Ages
    MIN_AGE: 20, // NFL minimum is ~21
    MAX_AGE_NON_QB: 38,
    MAX_AGE_QB: 45,
    MAX_AGE_K: 50, // Kickers can play longer
  };

  detectHallucinations(players: any[]): HallucinationIssue[] {
    this.issues = [];
    
    // 1. Check for duplicate players with different IDs
    this.checkDuplicatePlayers(players);
    
    // 2. Check for impossible statistical combinations
    this.checkImpossibleStats(players);
    
    // 3. Check for suspicious name patterns
    this.checkNamePatterns(players);
    
    // 4. Check for missing critical data
    this.checkMissingData(players);
    
    // 5. Check for statistical outliers that suggest data errors
    this.checkStatisticalOutliers(players);
    
    // 6. Check for impossible position/stat combinations
    this.checkPositionStatCombinations(players);
    
    // 7. Check for temporal impossibilities
    this.checkTemporalImpossibilities(players);
    
    return this.issues;
  }
  
  private checkDuplicatePlayers(players: any[]): void {
    const nameMap = new Map<string, any[]>();
    
    players.forEach(player => {
      const normalizedName = this.normalizeName(player.name);
      if (!nameMap.has(normalizedName)) {
        nameMap.set(normalizedName, []);
      }
      nameMap.get(normalizedName)!.push(player);
    });
    
    nameMap.forEach((duplicates, name) => {
      if (duplicates.length > 1 && duplicates[0].position !== 'DST') {
        // Check if they're actually different players (different teams/positions)
        const uniqueTeams = new Set(duplicates.map(p => p.team));
        const uniquePositions = new Set(duplicates.map(p => p.position));
        
        if (uniqueTeams.size === 1 && uniquePositions.size === 1) {
          this.issues.push({
            type: 'duplicate_player',
            playerName: name,
            description: `Player "${name}" appears ${duplicates.length} times with same team/position`,
            confidence: 'high',
            details: { 
              count: duplicates.length,
              ids: duplicates.map(p => p.id),
              team: duplicates[0].team
            }
          });
        }
      }
    });
  }
  
  private checkImpossibleStats(players: any[]): void {
    players.forEach(player => {
      // Check catch rate
      if (player.receptions && player.targets) {
        const catchRate = player.receptions / player.targets;
        if (catchRate > this.IMPOSSIBLE_PATTERNS.MAX_CATCH_RATE) {
          this.issues.push({
            type: 'impossible_stat',
            playerId: player.id,
            playerName: player.name,
            description: `Impossible catch rate: ${(catchRate * 100).toFixed(1)}% (${player.receptions}/${player.targets})`,
            confidence: 'high',
            details: { catchRate, receptions: player.receptions, targets: player.targets }
          });
        }
      }
      
      // Check projected points
      if (player.projectedPoints < this.IMPOSSIBLE_PATTERNS.MIN_PROJECTED_POINTS) {
        this.issues.push({
          type: 'impossible_stat',
          playerId: player.id,
          playerName: player.name,
          description: `Negative projected points: ${player.projectedPoints}`,
          confidence: 'high',
          details: { projectedPoints: player.projectedPoints }
        });
      }
      
      if (player.projectedPoints > this.IMPOSSIBLE_PATTERNS.MAX_PROJECTED_POINTS) {
        this.issues.push({
          type: 'impossible_stat',
          playerId: player.id,
          playerName: player.name,
          description: `Impossibly high projected points: ${player.projectedPoints}`,
          confidence: 'high',
          details: { projectedPoints: player.projectedPoints }
        });
      }
      
      // Check age limits by position
      if (player.age && player.position !== 'DST') {
        const maxAge = player.position === 'QB' ? this.IMPOSSIBLE_PATTERNS.MAX_AGE_QB :
                      player.position === 'K' ? this.IMPOSSIBLE_PATTERNS.MAX_AGE_K :
                      this.IMPOSSIBLE_PATTERNS.MAX_AGE_NON_QB;
        
        if (player.age > maxAge) {
          this.issues.push({
            type: 'impossible_stat',
            playerId: player.id,
            playerName: player.name,
            description: `Impossible age for ${player.position}: ${player.age} years old`,
            confidence: 'high',
            details: { age: player.age, position: player.position }
          });
        }
      }
      
      // Check rushing TDs
      if (player.rushingTDs > this.IMPOSSIBLE_PATTERNS.MAX_RUSHING_TDS) {
        this.issues.push({
          type: 'impossible_stat',
          playerId: player.id,
          playerName: player.name,
          description: `Impossible rushing TDs: ${player.rushingTDs} (NFL record is 28)`,
          confidence: 'high',
          details: { rushingTDs: player.rushingTDs }
        });
      }
      
      // Check passing TDs for QBs
      if (player.position === 'QB' && player.passingTDs > this.IMPOSSIBLE_PATTERNS.MAX_PASSING_TDS) {
        this.issues.push({
          type: 'impossible_stat',
          playerId: player.id,
          playerName: player.name,
          description: `Impossible passing TDs: ${player.passingTDs} (NFL record is 55)`,
          confidence: 'high',
          details: { passingTDs: player.passingTDs }
        });
      }
    });
  }
  
  private checkNamePatterns(players: any[]): void {
    players.forEach(player => {
      // Check for obviously fake or test names
      const suspiciousPatterns = [
        /^Test /i,
        /^Player\d+$/i,
        /^Unknown/i,
        /^TBD$/i,
        /^N\/A$/i,
        /\d{3,}/,  // Names with 3+ digits
        /^[A-Z]{4,}$/, // All caps abbreviations
      ];
      
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(player.name)) {
          this.issues.push({
            type: 'name_pattern',
            playerId: player.id,
            playerName: player.name,
            description: `Suspicious name pattern detected: "${player.name}"`,
            confidence: 'medium',
            details: { pattern: pattern.toString() }
          });
        }
      }
      
      // Check for repeated characters (like "AAAA Smith")
      if (/(.)\1{3,}/.test(player.name)) {
        this.issues.push({
          type: 'name_pattern',
          playerId: player.id,
          playerName: player.name,
          description: `Name contains repeated characters: "${player.name}"`,
          confidence: 'high',
          details: { name: player.name }
        });
      }
    });
  }
  
  private checkMissingData(players: any[]): void {
    const requiredFields = {
      'QB': ['passingYards', 'passingTDs'],
      'RB': ['rushingYards'],
      'WR': ['receptions', 'targets'],
      'TE': ['receptions', 'targets'],
    };
    
    players.forEach(player => {
      const required = requiredFields[player.position as keyof typeof requiredFields];
      if (required && player.projectedPoints > 50) { // Only check significant players
        for (const field of required) {
          if (player[field] === undefined || player[field] === null || player[field] === 0) {
            this.issues.push({
              type: 'missing_required',
              playerId: player.id,
              playerName: player.name,
              description: `Missing critical stat for ${player.position}: ${field}`,
              confidence: 'medium',
              details: { field, position: player.position, projectedPoints: player.projectedPoints }
            });
          }
        }
      }
    });
  }
  
  private checkStatisticalOutliers(players: any[]): void {
    // Group by position for comparison
    const positionGroups = new Map<string, any[]>();
    players.forEach(player => {
      if (!positionGroups.has(player.position)) {
        positionGroups.set(player.position, []);
      }
      positionGroups.get(player.position)!.push(player);
    });
    
    positionGroups.forEach((group, position) => {
      if (group.length < 10) return; // Need enough players for statistics
      
      // Calculate averages
      const avgPoints = group.reduce((sum, p) => sum + (p.projectedPoints || 0), 0) / group.length;
      const avgADP = group.filter(p => p.adp < 500).reduce((sum, p) => sum + p.adp, 0) / group.filter(p => p.adp < 500).length;
      
      group.forEach(player => {
        // Check for extreme outliers (5x average is suspicious)
        if (player.projectedPoints > avgPoints * 5 && player.projectedPoints > 100) {
          this.issues.push({
            type: 'stat_outlier',
            playerId: player.id,
            playerName: player.name,
            description: `Extreme outlier: ${player.projectedPoints.toFixed(1)} points (${position} avg: ${avgPoints.toFixed(1)})`,
            confidence: 'medium',
            details: { 
              projectedPoints: player.projectedPoints,
              positionAverage: avgPoints,
              ratio: player.projectedPoints / avgPoints
            }
          });
        }
        
        // Check for ADP/projection mismatch
        if (player.adp < 50 && player.projectedPoints < avgPoints * 0.5) {
          this.issues.push({
            type: 'impossible_combination',
            playerId: player.id,
            playerName: player.name,
            description: `High ADP (${player.adp}) but low projection (${player.projectedPoints.toFixed(1)} pts)`,
            confidence: 'low',
            details: { adp: player.adp, projectedPoints: player.projectedPoints }
          });
        }
      });
    });
  }
  
  private checkPositionStatCombinations(players: any[]): void {
    players.forEach(player => {
      // QBs shouldn't have receiving stats as primary stats
      if (player.position === 'QB') {
        if (player.receptions > 10) {
          this.issues.push({
            type: 'impossible_combination',
            playerId: player.id,
            playerName: player.name,
            description: `QB with ${player.receptions} receptions (extremely rare)`,
            confidence: 'medium',
            details: { position: 'QB', receptions: player.receptions }
          });
        }
      }
      
      // Kickers shouldn't have any offensive stats
      if (player.position === 'K') {
        if (player.passingYards || player.rushingYards || player.receptions) {
          this.issues.push({
            type: 'impossible_combination',
            playerId: player.id,
            playerName: player.name,
            description: `Kicker with offensive stats`,
            confidence: 'high',
            details: { 
              passingYards: player.passingYards,
              rushingYards: player.rushingYards,
              receptions: player.receptions
            }
          });
        }
      }
      
      // DST shouldn't have individual stats
      if (player.position === 'DST') {
        if (player.age || player.experience) {
          this.issues.push({
            type: 'impossible_combination',
            playerId: player.id,
            playerName: player.name,
            description: `Defense/ST with individual player stats`,
            confidence: 'high',
            details: { age: player.age, experience: player.experience }
          });
        }
      }
    });
  }
  
  private checkTemporalImpossibilities(players: any[]): void {
    players.forEach(player => {
      // Experience can't exceed age minus 18 (minimum draft age)
      if (player.age && player.experience && player.position !== 'DST') {
        const maxPossibleExperience = player.age - 20; // Most players enter at 21-22
        if (player.experience > maxPossibleExperience) {
          this.issues.push({
            type: 'impossible_combination',
            playerId: player.id,
            playerName: player.name,
            description: `Experience (${player.experience}) exceeds possible years (age ${player.age})`,
            confidence: 'high',
            details: { age: player.age, experience: player.experience, maxPossible: maxPossibleExperience }
          });
        }
      }
      
      // Rookies (experience 0) should be young
      if (player.experience === 0 && player.age > 25 && player.position !== 'DST') {
        this.issues.push({
          type: 'impossible_combination',
          playerId: player.id,
          playerName: player.name,
          description: `Rookie at age ${player.age} (unusual)`,
          confidence: 'low',
          details: { age: player.age, experience: player.experience }
          });
      }
    });
  }
  
  private normalizeName(name: string): string {
    return name.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/jr$|sr$|iii$|ii$|iv$|v$/g, '');
  }
  
  getSummary(): { total: number; high: number; medium: number; low: number } {
    return {
      total: this.issues.length,
      high: this.issues.filter(i => i.confidence === 'high').length,
      medium: this.issues.filter(i => i.confidence === 'medium').length,
      low: this.issues.filter(i => i.confidence === 'low').length
    };
  }
  
  getIssues(): HallucinationIssue[] {
    return this.issues;
  }
  
  getHighConfidenceIssues(): HallucinationIssue[] {
    return this.issues.filter(i => i.confidence === 'high');
  }
}

export const hallucinationDetector = new HallucinationDetector();