/**
 * Data validation service to flag suspicious or incorrect player data
 * Flags issues but doesn't fix them - for monitoring data quality
 */

export interface DataValidationIssue {
  playerId: string;
  playerName: string;
  field: string;
  value: any;
  issue: string;
  severity: 'warning' | 'error';
}

export class DataValidator {
  private issues: DataValidationIssue[] = [];

  validatePlayerData(player: any): DataValidationIssue[] {
    const playerIssues: DataValidationIssue[] = [];

    // Age validation
    if (player.position !== 'DST') {
      if (player.age === 0 || player.age === undefined || player.age === null) {
        playerIssues.push({
          playerId: player.id,
          playerName: player.name,
          field: 'age',
          value: player.age,
          issue: 'Missing age data (defaulted to 0)',
          severity: 'error'
        });
      } else if (player.age < 20) {
        playerIssues.push({
          playerId: player.id,
          playerName: player.name,
          field: 'age',
          value: player.age,
          issue: `Suspiciously young age: ${player.age}`,
          severity: 'warning'
        });
      } else if (player.age > 40) {
        // Downgrade severity for QBs (Aaron Rodgers, etc.)
        const severity = player.position === 'QB' ? 'warning' : 'warning';
        // Actually, age 40+ for QB is fine, skip warning
        if (player.position !== 'QB') {
          playerIssues.push({
            playerId: player.id,
            playerName: player.name,
            field: 'age',
            value: player.age,
            issue: `Suspiciously old age: ${player.age}`,
            severity: 'warning'
          });
        }
      }
    }

    // Experience validation
    if (player.position !== 'DST') {
      const maxExperience = player.age ? player.age - 18 : 22; // Max possible years in league
      
      if (player.experience > maxExperience) {
        playerIssues.push({
          playerId: player.id,
          playerName: player.name,
          field: 'experience',
          value: player.experience,
          issue: `Experience (${player.experience}) exceeds possible years since age 18 (max: ${maxExperience})`,
          severity: 'error'
        });
      }
      
      if (player.experience < 0) {
        playerIssues.push({
          playerId: player.id,
          playerName: player.name,
          field: 'experience',
          value: player.experience,
          issue: 'Negative experience value',
          severity: 'error'
        });
      }
    }

    // CVS Score validation
    if (isNaN(player.cvsScore)) {
      playerIssues.push({
        playerId: player.id,
        playerName: player.name,
        field: 'cvsScore',
        value: player.cvsScore,
        issue: 'CVS Score is NaN',
        severity: 'warning'
      });
    } else if (player.cvsScore < 0) {
      playerIssues.push({
        playerId: player.id,
        playerName: player.name,
        field: 'cvsScore',
        value: player.cvsScore,
        issue: 'Negative CVS Score',
        severity: 'error'
      });
    } else if (player.cvsScore > 150) {
      playerIssues.push({
        playerId: player.id,
        playerName: player.name,
        field: 'cvsScore',
        value: player.cvsScore,
        issue: `Unusually high CVS Score: ${player.cvsScore}`,
        severity: 'warning'
      });
    }

    // Projection validation
    if (player.projectedPoints < 0) {
      playerIssues.push({
        playerId: player.id,
        playerName: player.name,
        field: 'projectedPoints',
        value: player.projectedPoints,
        issue: 'Negative projected points',
        severity: 'error'
      });
    } else if (player.projectedPoints > 500) {
      playerIssues.push({
        playerId: player.id,
        playerName: player.name,
        field: 'projectedPoints',
        value: player.projectedPoints,
        issue: `Unrealistic projected points: ${player.projectedPoints}`,
        severity: 'warning'
      });
    }

    // ADP validation (position-specific thresholds)
    if (player.adp < 0) {
      playerIssues.push({
        playerId: player.id,
        playerName: player.name,
        field: 'adp',
        value: player.adp,
        issue: 'Negative ADP',
        severity: 'error'
      });
    } else if (player.adp !== 999) { // 999 is often used for undrafted
      // Position-specific ADP thresholds
      const adpThresholds: { [key: string]: number } = {
        'QB': 250,
        'RB': 300,
        'WR': 300,
        'TE': 250,
        'K': 600,   // Much higher for kickers - they often go undrafted
        'DST': 250
      };
      
      const threshold = adpThresholds[player.position] || 300;
      
      if (player.adp > threshold) {
        playerIssues.push({
          playerId: player.id,
          playerName: player.name,
          field: 'adp',
          value: player.adp,
          issue: `Unusually high ADP for ${player.position}: ${player.adp}`,
          severity: 'warning'
        });
      }
    }

    // Auction value validation
    if (player.auctionValue < 0) {
      playerIssues.push({
        playerId: player.id,
        playerName: player.name,
        field: 'auctionValue',
        value: player.auctionValue,
        issue: 'Negative auction value',
        severity: 'error'
      });
    } else if (player.auctionValue > 100) {
      playerIssues.push({
        playerId: player.id,
        playerName: player.name,
        field: 'auctionValue',
        value: player.auctionValue,
        issue: `Unusually high auction value: $${player.auctionValue}`,
        severity: 'warning'
      });
    }

    // Reception/target validation for skill players
    if (['WR', 'RB', 'TE'].includes(player.position)) {
      if (player.targets && player.receptions) {
        if (player.receptions > player.targets) {
          playerIssues.push({
            playerId: player.id,
            playerName: player.name,
            field: 'receptions/targets',
            value: `${player.receptions}/${player.targets}`,
            issue: 'More receptions than targets',
            severity: 'error'
          });
        }
        
        const catchRate = player.receptions / player.targets;
        if (catchRate > 1) {
          playerIssues.push({
            playerId: player.id,
            playerName: player.name,
            field: 'catchRate',
            value: catchRate,
            issue: `Impossible catch rate: ${(catchRate * 100).toFixed(1)}%`,
            severity: 'error'
          });
        }
      }
    }

    // Bye week validation
    if (player.byeWeek && (player.byeWeek < 1 || player.byeWeek > 18)) {
      playerIssues.push({
        playerId: player.id,
        playerName: player.name,
        field: 'byeWeek',
        value: player.byeWeek,
        issue: `Invalid bye week: ${player.byeWeek}`,
        severity: 'error'
      });
    }

    this.issues.push(...playerIssues);
    return playerIssues;
  }

  validateAllPlayers(players: any[]): void {
    console.log('\n=== Data Validation Report ===');
    this.issues = [];
    
    players.forEach(player => {
      this.validatePlayerData(player);
    });

    if (this.issues.length === 0) {
      console.log('✅ No data validation issues found');
      return;
    }

    // Group issues by severity
    const errors = this.issues.filter(i => i.severity === 'error');
    const warnings = this.issues.filter(i => i.severity === 'warning');

    if (errors.length > 0) {
      console.log(`\n❌ Found ${errors.length} ERRORS:`);
      errors.slice(0, 10).forEach(issue => {
        console.log(`  - ${issue.playerName}: ${issue.issue}`);
      });
      if (errors.length > 10) {
        console.log(`  ... and ${errors.length - 10} more errors`);
      }
    }

    if (warnings.length > 0) {
      console.log(`\n⚠️  Found ${warnings.length} WARNINGS:`);
      warnings.slice(0, 10).forEach(issue => {
        console.log(`  - ${issue.playerName}: ${issue.issue}`);
      });
      if (warnings.length > 10) {
        console.log(`  ... and ${warnings.length - 10} more warnings`);
      }
    }

    // Summary by field
    const issuesByField = new Map<string, number>();
    this.issues.forEach(issue => {
      issuesByField.set(issue.field, (issuesByField.get(issue.field) || 0) + 1);
    });

    console.log('\n📊 Issues by field:');
    Array.from(issuesByField.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([field, count]) => {
        console.log(`  - ${field}: ${count} issues`);
      });

    console.log('\n=== End Validation Report ===\n');
  }

  getIssues(): DataValidationIssue[] {
    return this.issues;
  }

  getIssuesForPlayer(playerId: string): DataValidationIssue[] {
    return this.issues.filter(i => i.playerId === playerId);
  }
}

export const dataValidator = new DataValidator();