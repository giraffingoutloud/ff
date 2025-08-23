/**
 * System Audit - Check for inconsistencies and potential accuracy issues
 */

import { defaultLeagueSettings } from '../services/valuation/leagueSettings';
import { ReplacementLevelCalculator } from '../services/valuation/replacementLevelCalculator';
import { IntrinsicValueEngine } from '../services/valuation/intrinsicValueEngine';
import { MarketPriceModel } from '../services/market/marketPriceModel';
import { EdgeCalculator } from '../services/edge/edgeCalculator';

console.log('='.repeat(70));
console.log('SYSTEM ACCURACY AUDIT');
console.log('='.repeat(70));

// 1. Check Method Names
console.log('\n1. METHOD NAMING CONSISTENCY CHECK:');
console.log('-'.repeat(40));

const methodChecks = [
  {
    class: 'IntrinsicValueEngine',
    instance: new IntrinsicValueEngine(defaultLeagueSettings),
    expectedMethods: [
      'calculateValue',        // Single player
      'calculateAllValues',    // Multiple players
      'calculateVORP',        // Is this a method?
    ]
  },
  {
    class: 'MarketPriceModel',
    instance: new MarketPriceModel(defaultLeagueSettings),
    expectedMethods: [
      'predictPrice',         // Single price
      'predictAllPrices',     // Multiple prices
      'predictMultiple',      // Which one is it?
    ]
  },
  {
    class: 'ReplacementLevelCalculator',
    instance: new ReplacementLevelCalculator(defaultLeagueSettings),
    expectedMethods: [
      'calculateReplacementLevel',     // Single?
      'calculateAllReplacementLevels', // Multiple?
      'getReplacementLevel',           // Getter?
    ]
  },
  {
    class: 'EdgeCalculator',
    instance: new EdgeCalculator(),
    expectedMethods: [
      'calculateEdge',          // Single?
      'calculateMultipleEdges', // Multiple?
    ]
  }
];

methodChecks.forEach(check => {
  console.log(`\n${check.class}:`);
  const proto = Object.getPrototypeOf(check.instance);
  const actualMethods = Object.getOwnPropertyNames(proto)
    .filter(name => typeof proto[name] === 'function' && name !== 'constructor');
  
  check.expectedMethods.forEach(method => {
    const exists = actualMethods.includes(method);
    console.log(`  ${method}: ${exists ? '✅ EXISTS' : '❌ NOT FOUND'}`);
  });
  
  console.log('  Actual methods:', actualMethods.filter(m => m.includes('calculate') || m.includes('predict')).join(', '));
});

// 2. Check ESPN PPR Scoring Settings
console.log('\n2. ESPN PPR SCORING VERIFICATION:');
console.log('-'.repeat(40));

const scoring = defaultLeagueSettings.scoring;
const espnStandard = {
  passingTD: 4,
  passingYards: 0.04,  // 1 point per 25 yards
  passingInt: -2,
  rushingTD: 6,
  rushingYards: 0.1,   // 1 point per 10 yards
  receivingTD: 6,
  receivingYards: 0.1, // 1 point per 10 yards
  receptions: 1,       // PPR
  fumbles: -2,
  twoPointConversion: 2
};

console.log('Setting         | Our Value | ESPN Standard | Match');
console.log('----------------|-----------|---------------|------');
Object.entries(espnStandard).forEach(([key, espnValue]) => {
  const ourValue = scoring[key as keyof typeof scoring] ?? 'MISSING';
  const match = ourValue === espnValue ? '✅' : '❌';
  console.log(`${key.padEnd(15)} | ${String(ourValue).padEnd(9)} | ${String(espnValue).padEnd(13)} | ${match}`);
});

// Check for missing scoring settings
const missingSettings = Object.keys(espnStandard).filter(key => 
  !(key in scoring)
);
if (missingSettings.length > 0) {
  console.log('\n⚠️ MISSING SETTINGS:', missingSettings.join(', '));
}

// 3. Check League Configuration
console.log('\n3. LEAGUE CONFIGURATION AUDIT:');
console.log('-'.repeat(40));

const checks = [
  { name: 'Teams', value: defaultLeagueSettings.numTeams, expected: 12 },
  { name: 'Budget', value: defaultLeagueSettings.budget, expected: 200 },
  { name: 'Roster Size', value: defaultLeagueSettings.rosterSize, expected: 16 },
  { name: 'QB Min', value: defaultLeagueSettings.rosterRequirements.QB.min, expected: 1 },
  { name: 'RB Min', value: defaultLeagueSettings.rosterRequirements.RB.min, expected: 2 },
  { name: 'WR Min', value: defaultLeagueSettings.rosterRequirements.WR.min, expected: 2 },
  { name: 'TE Min', value: defaultLeagueSettings.rosterRequirements.TE.min, expected: 1 },
  { name: 'FLEX Count', value: defaultLeagueSettings.rosterRequirements.FLEX?.count, expected: 1 },
  { name: 'K Min', value: defaultLeagueSettings.rosterRequirements.K.min, expected: 1 },
  { name: 'DST Min', value: defaultLeagueSettings.rosterRequirements.DST.min, expected: 1 },
  { name: 'Bench Spots', value: defaultLeagueSettings.rosterRequirements.benchSpots, expected: 7 },
];

console.log('Setting         | Value | Expected | Status');
console.log('----------------|-------|----------|-------');
checks.forEach(check => {
  const status = check.value === check.expected ? '✅' : '❌';
  console.log(`${check.name.padEnd(15)} | ${String(check.value).padEnd(5)} | ${String(check.expected).padEnd(8)} | ${status}`);
});

// 4. Check for Hardcoded Values
console.log('\n4. SEARCHING FOR HARDCODED VALUES:');
console.log('-'.repeat(40));

// These are values that should probably come from settings
const suspiciousPatterns = [
  { pattern: 'budget.*200', description: 'Hardcoded $200 budget' },
  { pattern: 'teams.*12', description: 'Hardcoded 12 teams' },
  { pattern: 'roster.*16', description: 'Hardcoded 16 roster size' },
  { pattern: 'bench.*6', description: 'Hardcoded 6 bench (should be 7)' },
  { pattern: '0\\.05.*streaming|1\\.05.*stream', description: 'Hardcoded 5% streaming uplift' },
  { pattern: 'Math\\.log.*\\*.*5', description: 'Arbitrary logarithmic constant' },
];

console.log('Potential hardcoded values to check:');
suspiciousPatterns.forEach(p => {
  console.log(`  • ${p.description}`);
});

// 5. Check Data Pipeline
console.log('\n5. DATA PIPELINE VERIFICATION:');
console.log('-'.repeat(40));

console.log('Data flow should be:');
console.log('  1. canonical_data (CSV files) - SOURCE OF TRUTH');
console.log('  2. Sleeper API - injury status ONLY');
console.log('  3. Never override canonical data');
console.log('');
console.log('Check these potential issues:');
console.log('  • Are we loading all CSV files?');
console.log('  • Are projections coming from canonical_data/projections/?');
console.log('  • Is ADP coming from canonical_data/adp/adp0_2025.csv?');
console.log('  • Are we accidentally using mock/test data anywhere?');

// 6. Check FLEX Eligibility
console.log('\n6. FLEX POSITION ELIGIBILITY:');
console.log('-'.repeat(40));

const flexPositions = defaultLeagueSettings.rosterRequirements.FLEX?.positions || [];
console.log('FLEX eligible positions:', flexPositions.join(', '));
console.log('Expected: RB, WR, TE');
console.log('Match:', JSON.stringify(flexPositions) === JSON.stringify(['RB', 'WR', 'TE']) ? '✅' : '❌');

// 7. Summary
console.log('\n' + '='.repeat(70));
console.log('AUDIT SUMMARY:');
console.log('='.repeat(70));

console.log('\nKEY FINDINGS:');
console.log('1. Method naming is inconsistent (calculate vs calculateAll)');
console.log('2. Some scoring settings may be missing');
console.log('3. Check for hardcoded values that should use settings');
console.log('4. Verify all data comes from canonical sources');
console.log('5. Ensure FLEX eligibility is correct');

console.log('\nRECOMMENDATIONS:');
console.log('• Standardize method naming convention');
console.log('• Add missing ESPN scoring settings');
console.log('• Replace hardcoded values with settings');
console.log('• Add data source validation');
console.log('• Document all assumptions clearly');