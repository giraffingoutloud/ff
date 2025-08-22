import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

// Load and analyze all players
const adpPath = '/mnt/c/Users/giraf/Documents/projects/ff/canonical_data/adp/adp0_2025.csv';
const adpContent = fs.readFileSync(adpPath, 'utf-8');
const adpRecords = parse(adpContent, { columns: true });

const invalidReasons: Record<string, any[]> = {
  'N/A Auction Value': [],
  'Insufficient Data': [],
  'Zero/Missing Points': [],
  'Invalid Auction Value': [],
  'Missing Position': []
};

const validPlayers: any[] = [];
let totalCount = 0;

for (const record of adpRecords) {
  totalCount++;
  const name = record['Full Name'];
  const auctionValueStr = record['Auction Value'];
  const projectedPoints = parseFloat(record['Projected Points']) || 0;
  const dataStatus = record['Data Status'];
  const position = record['Position'];
  
  let isValid = true;
  let reason = '';
  
  // Check for N/A auction value
  if (auctionValueStr === 'N/A' || auctionValueStr === null || auctionValueStr === '') {
    invalidReasons['N/A Auction Value'].push({ name, team: record['Team Abbreviation'], position, points: projectedPoints });
    isValid = false;
    reason = 'N/A Auction Value';
  }
  // Check for Insufficient Data status
  else if (dataStatus === 'Insufficient Data') {
    invalidReasons['Insufficient Data'].push({ name, team: record['Team Abbreviation'], position, points: projectedPoints, auctionValue: auctionValueStr });
    isValid = false;
    reason = 'Insufficient Data';
  }
  // Check for zero or missing points
  else if (projectedPoints <= 0) {
    invalidReasons['Zero/Missing Points'].push({ name, team: record['Team Abbreviation'], position, auctionValue: auctionValueStr });
    isValid = false;
    reason = 'Zero/Missing Points';
  }
  // Check for invalid auction value (not a number or <= 0)
  else {
    const auctionValue = parseFloat(auctionValueStr);
    if (isNaN(auctionValue) || auctionValue <= 0) {
      invalidReasons['Invalid Auction Value'].push({ name, team: record['Team Abbreviation'], position, points: projectedPoints, auctionValue: auctionValueStr });
      isValid = false;
      reason = 'Invalid Auction Value';
    }
  }
  
  // Check for missing position
  if (!position) {
    invalidReasons['Missing Position'].push({ name, team: record['Team Abbreviation'], points: projectedPoints, auctionValue: auctionValueStr });
    isValid = false;
    reason = 'Missing Position';
  }
  
  if (isValid) {
    validPlayers.push({
      name,
      position,
      team: record['Team Abbreviation'],
      points: projectedPoints,
      auctionValue: parseFloat(auctionValueStr)
    });
  }
}

console.log('\n════════════════════════════════════════════════════════════════════════════════');
console.log('                      PLAYER DATABASE ANALYSIS REPORT                           ');
console.log('════════════════════════════════════════════════════════════════════════════════\n');

console.log(`Total players in database: ${totalCount}`);
console.log(`Valid players: ${validPlayers.length}`);
console.log(`Invalid players: ${totalCount - validPlayers.length}\n`);

console.log('BREAKDOWN OF INVALID PLAYERS:\n');

// Show details for each invalid reason
for (const [reason, players] of Object.entries(invalidReasons)) {
  if (players.length === 0) continue;
  
  console.log(`${reason}: ${players.length} players`);
  console.log('─'.repeat(60));
  
  // Show first 10 examples
  const examples = players.slice(0, 10);
  for (const p of examples) {
    if (reason === 'N/A Auction Value') {
      console.log(`  • ${p.name} (${p.team}, ${p.position}) - ${p.points} pts`);
    } else if (reason === 'Insufficient Data') {
      console.log(`  • ${p.name} (${p.team}, ${p.position}) - Status: "Insufficient Data"`);
    } else if (reason === 'Zero/Missing Points') {
      console.log(`  • ${p.name} (${p.team}, ${p.position}) - 0 projected points, $${p.auctionValue}`);
    } else {
      console.log(`  • ${p.name} (${p.team}) - ${JSON.stringify(p)}`);
    }
  }
  
  if (players.length > 10) {
    console.log(`  ... and ${players.length - 10} more\n`);
  } else {
    console.log();
  }
}

// Analyze the N/A auction values more closely
const naPlayers = invalidReasons['N/A Auction Value'];
if (naPlayers.length > 0) {
  console.log('DETAILED ANALYSIS OF N/A AUCTION VALUES:');
  console.log('─'.repeat(60));
  
  // Group by position
  const byPosition: Record<string, number> = {};
  for (const p of naPlayers) {
    byPosition[p.position] = (byPosition[p.position] || 0) + 1;
  }
  
  console.log('By Position:');
  for (const [pos, count] of Object.entries(byPosition)) {
    console.log(`  ${pos}: ${count} players`);
  }
  console.log();
  
  // Check if these are mostly deep bench/undrafted players
  const highValueNA = naPlayers.filter((p: any) => p.points > 100);
  if (highValueNA.length > 0) {
    console.log(`Notable players with N/A auction value but good projections:`);
    for (const p of highValueNA.slice(0, 5)) {
      console.log(`  • ${p.name} (${p.position}) - ${p.points} projected points`);
    }
  }
}

console.log('\n════════════════════════════════════════════════════════════════════════════════');