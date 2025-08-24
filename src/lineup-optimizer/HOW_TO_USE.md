# How to Use the ESPN Fantasy Football Lineup Optimizer

## Quick Start

### 1. Basic Usage - Optimize Your Weekly Lineup

```typescript
import { LineupOptimizer2025 } from './core/optimizer2025';
import { PlayerProjection, ESPN_PPR_2025 } from './domain/typesCorrected';
import { createPlayerProjection } from './example2025';

// Create your roster (16 players total)
const myRoster: PlayerProjection[] = [
  // Starters
  createPlayerProjection('QB1', 'Josh Allen', 'BUF', 'QB', 22, 6),
  createPlayerProjection('RB1', 'Christian McCaffrey', 'SF', 'RB', 18, 5),
  createPlayerProjection('RB2', 'Austin Ekeler', 'LAC', 'RB', 14, 4),
  createPlayerProjection('WR1', 'Tyreek Hill', 'MIA', 'WR', 16, 5),
  createPlayerProjection('WR2', 'Stefon Diggs', 'BUF', 'WR', 14, 4),
  createPlayerProjection('TE1', 'Travis Kelce', 'KC', 'TE', 11, 3),
  createPlayerProjection('K1', 'Justin Tucker', 'BAL', 'K', 9, 2),
  createPlayerProjection('DST1', 'Buffalo Bills', 'BUF', 'DST', 10, 4),
  
  // Bench (7 players)
  createPlayerProjection('QB2', 'Jalen Hurts', 'PHI', 'QB', 20, 5),
  createPlayerProjection('RB3', 'Tony Pollard', 'DAL', 'RB', 12, 4),
  createPlayerProjection('RB4', 'Rhamondre Stevenson', 'NE', 'RB', 10, 3),
  createPlayerProjection('WR3', 'CeeDee Lamb', 'DAL', 'WR', 13, 4),
  createPlayerProjection('WR4', 'A.J. Brown', 'PHI', 'WR', 12, 4),
  createPlayerProjection('WR5', 'Chris Olave', 'NO', 'WR', 10, 3),
  createPlayerProjection('TE2', 'Mark Andrews', 'BAL', 'TE', 9, 3),
  createPlayerProjection('FLEX1', 'Dameon Pierce', 'HOU', 'RB', 8, 3)
];

// Initialize optimizer
const optimizer = new LineupOptimizer2025();

// Find best lineup
const result = optimizer.optimizeLineup(
  myRoster,
  ESPN_PPR_2025,
  125,  // Opponent's projected score
  25    // Opponent's standard deviation
);

// Display results
console.log('Best Lineup:');
result.lineup.forEach(p => {
  console.log(`${p.position}: ${p.name} - ${p.distribution.mean.toFixed(1)} pts`);
});
console.log(`Win Probability: ${(result.winProb * 100).toFixed(1)}%`);
```

### 2. Using Real Canonical Data

```typescript
import { DataDrivenLineupOptimizer } from './core/optimizerWithData';
import * as path from 'path';

async function optimizeWithRealData() {
  // Initialize with canonical data
  const dataPath = path.join(__dirname, '../../canonical_data');
  const optimizer = new DataDrivenLineupOptimizer(dataPath);
  
  // Load all data
  await optimizer.initialize();
  
  // Your roster (use real player names from canonical data)
  const myRosterNames = [
    'Josh Allen',
    'Christian McCaffrey', 
    'Saquon Barkley',
    'Tyreek Hill',
    'Ja\'Marr Chase',
    'CeeDee Lamb',
    'Travis Kelce',
    'Justin Tucker',
    'Buffalo Bills',
    // Bench
    'Jalen Hurts',
    'Tony Pollard',
    'Calvin Ridley',
    'Mike Evans',
    'George Kittle',
    'Dallas Cowboys',
    'Tyler Bass'
  ];
  
  // Optimize for Week 1
  const result = await optimizer.optimize({
    myRoster: myRosterNames,
    opponentRoster: [], // Leave empty to use league average
    week: 1,
    useCorrelations: true
  });
  
  // Display optimized lineup
  console.log('Optimal Week 1 Lineup:');
  console.log(result.lineup);
  console.log(`Expected Points: ${result.expectedPoints.toFixed(1)}`);
  console.log(`Win Probability: ${(result.winProbability * 100).toFixed(1)}%`);
  
  // Show any warnings
  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    result.warnings.forEach(w => console.log(`  - ${w}`));
  }
}
```

### 3. Advanced: Consider Opponent's Roster

```typescript
import { opponentFromRoster } from './core/opponent2025';

// If you know your opponent's roster
const opponentRoster: PlayerProjection[] = [
  createPlayerProjection('OPP_QB1', 'Patrick Mahomes', 'KC', 'QB', 24, 5),
  createPlayerProjection('OPP_RB1', 'Bijan Robinson', 'ATL', 'RB', 19, 5),
  // ... rest of opponent's roster
];

// Model opponent
const opponentDist = opponentFromRoster(opponentRoster, ESPN_PPR_2025);

// Optimize against specific opponent
const result = optimizer.optimizeLineup(
  myRoster,
  ESPN_PPR_2025,
  opponentDist.mean,
  Math.sqrt(opponentDist.variance)
);
```

### 4. Weekly Optimization Workflow

```typescript
async function weeklyOptimization(week: number) {
  const optimizer = new DataDrivenLineupOptimizer('./canonical_data');
  await optimizer.initialize();
  
  // Step 1: Check for injuries and bye weeks
  const validation = optimizer.validateLineup(myRosterNames, week);
  if (!validation.valid) {
    console.log('Lineup Issues:');
    validation.errors.forEach(e => console.log(`  - ${e}`));
    
    if (validation.byeWeekConflicts.length > 0) {
      console.log('Players on bye:');
      validation.byeWeekConflicts.forEach(p => console.log(`  - ${p}`));
    }
  }
  
  // Step 2: Get available players by position
  const availableQBs = optimizer.getAvailablePlayersByPosition('QB');
  const availableRBs = optimizer.getAvailablePlayersByPosition('RB');
  
  // Step 3: Optimize lineup
  const result = await optimizer.optimize({
    myRoster: myRosterNames,
    opponentRoster: [],
    week: week,
    useCorrelations: true
  });
  
  return result;
}
```

## Command Line Usage

### Run the Example
```bash
npx tsx src/lineup-optimizer/example2025.ts
```

### Run Tests
```bash
# Test the optimizer
npx tsx src/lineup-optimizer/testRunner.ts

# Test data parsing
npx tsx src/lineup-optimizer/testParsers.ts

# Test statistical functions
npx tsx src/lineup-optimizer/testTruncatedNormal.ts
```

## Key Features

### 1. ESPN PPR Scoring
- 1 point per reception
- 0.1 points per rushing/receiving yard
- 6 points per touchdown
- Standard QB scoring (4 pts per passing TD)

### 2. Roster Requirements (ESPN Standard)
- **Starters (9 total):**
  - 1 QB
  - 2 RB
  - 2 WR
  - 1 TE
  - 1 FLEX (RB/WR/TE)
  - 1 K
  - 1 DST
- **Bench:** 7 players
- **Total:** 16 players

### 3. Optimization Features
- **Win Probability Maximization** - Finds lineup with best chance to win
- **Correlation Handling** - Accounts for same-team correlations
- **Injury Status** - Considers QUESTIONABLE/DOUBTFUL/OUT designations
- **Bye Week Handling** - Automatically excludes players on bye
- **Variance Modeling** - Uses truncated normal distributions

### 4. Data Sources
The optimizer uses canonical data from:
- Player projections (points, yards, TDs, etc.)
- Team power ratings
- Strength of schedule
- Historical stats (2023-2024)
- Average Draft Position (ADP)

## Tips for Best Results

1. **Update Projections Weekly** - Player projections change based on matchups
2. **Check Injury Reports** - Update player status before optimizing
3. **Consider Game Scripts** - High-correlation stacks for shootouts
4. **Monitor Weather** - Affects passing games and kickers
5. **Use Actual Opponent Roster** - More accurate than league average

## Example Output

```
=== OPTIMAL LINEUP ===
Position | Player         | Team | Proj | Status
---------|----------------|------|------|--------
QB       | Josh Allen     | BUF  | 22.0 | HEALTHY
RB       | C. McCaffrey   | SF   | 18.0 | HEALTHY
RB       | Austin Ekeler  | LAC  | 14.0 | HEALTHY
WR       | Tyreek Hill    | MIA  | 16.0 | HEALTHY
WR       | Stefon Diggs   | BUF  | 14.0 | HEALTHY
FLEX     | CeeDee Lamb    | DAL  | 13.0 | HEALTHY
TE       | Travis Kelce   | KC   | 11.0 | HEALTHY
K        | Justin Tucker  | BAL  |  9.0 | HEALTHY
DST      | Buffalo Bills  | BUF  | 10.0 | HEALTHY

Win Probability: 58.3%
Expected Score: 127.0 points
Expected Margin: +2.0 points
```

## Troubleshooting

### Common Issues

1. **"Player not found"** - Check exact spelling from canonical data
2. **"Invalid lineup"** - Ensure you have exactly 16 players
3. **"Module not found"** - Run from ff directory: `cd /mnt/c/Users/giraf/Documents/projects/ff`
4. **Low win probability** - Normal if opponent is projected higher

### Getting Help

Check the implementation details in:
- `IMPLEMENTATION_VERIFICATION_2025.md` - Technical documentation
- `example2025.ts` - Working example code
- Test files - Show various usage patterns