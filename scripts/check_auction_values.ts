import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

// Load the ADP file
const adpPath = '/mnt/c/Users/giraf/Documents/projects/ff/canonical_data/adp/adp0_2025.csv';
const adpContent = fs.readFileSync(adpPath, 'utf-8');
const adpRecords = parse(adpContent, { columns: true });

console.log('\n══════════════════════════════════════════════════════════════════════');
console.log('                    AUCTION VALUE ANALYSIS                            ');
console.log('══════════════════════════════════════════════════════════════════════\n');

// First, let's see how many total records
console.log(`Total rows in CSV: ${adpRecords.length}\n`);

// Count different types of auction values
const categories = {
  'Valid Numbers': [],
  'N/A Values': [],
  'Empty/Null': [],
  'Other': []
};

// Check first 300 records more carefully
console.log('FIRST 283 PLAYERS - AUCTION VALUE STATUS:\n');
console.log('Rank | Player Name                     | Team | Position | Auction Value | Status');
console.log('-----|--------------------------------|------|----------|---------------|--------');

for (let i = 0; i < Math.min(283, adpRecords.length); i++) {
  const record = adpRecords[i];
  const rank = record['Overall Rank'];
  const name = record['Full Name'];
  const team = record['Team Abbreviation'];
  const position = record['Position'];
  const auctionValueStr = record['Auction Value'];
  
  let category = '';
  let displayValue = auctionValueStr;
  
  if (auctionValueStr === 'N/A') {
    category = 'N/A';
    categories['N/A Values'].push(record);
  } else if (auctionValueStr === '' || auctionValueStr === null || auctionValueStr === undefined) {
    category = 'Empty';
    displayValue = '(empty)';
    categories['Empty/Null'].push(record);
  } else {
    const parsed = parseFloat(auctionValueStr);
    if (!isNaN(parsed) && parsed > 0) {
      category = 'Valid';
      categories['Valid Numbers'].push(record);
    } else {
      category = 'Invalid';
      categories['Other'].push(record);
    }
  }
  
  // Show every 10th player or interesting cases
  if (i < 20 || i % 20 === 0 || category !== 'Valid' || i === 282) {
    console.log(`${rank.padStart(4)} | ${name.padEnd(30)} | ${team.padEnd(4)} | ${position.padEnd(8)} | ${displayValue.padEnd(13)} | ${category}`);
  }
}

console.log('\n\nSUMMARY OF FIRST 283 PLAYERS:');
console.log('══════════════════════════════════════════════════════════════════════\n');

const first283 = adpRecords.slice(0, 283);
let validIn283 = 0;
let naIn283 = 0;
let otherIn283 = 0;

for (const record of first283) {
  const auctionValueStr = record['Auction Value'];
  if (auctionValueStr === 'N/A') {
    naIn283++;
  } else if (auctionValueStr === '' || auctionValueStr === null) {
    otherIn283++;
  } else {
    const parsed = parseFloat(auctionValueStr);
    if (!isNaN(parsed) && parsed > 0) {
      validIn283++;
    } else {
      otherIn283++;
    }
  }
}

console.log(`Valid auction values: ${validIn283}`);
console.log(`N/A auction values: ${naIn283}`);
console.log(`Other/Invalid: ${otherIn283}`);

// Check if the app might be assigning default values to N/A entries
console.log('\n\nPLAYERS WITH N/A VALUES IN FIRST 283:');
console.log('══════════════════════════════════════════════════════════════════════\n');

let naCount = 0;
for (let i = 0; i < Math.min(283, adpRecords.length); i++) {
  const record = adpRecords[i];
  if (record['Auction Value'] === 'N/A') {
    naCount++;
    if (naCount <= 10) {
      console.log(`${record['Overall Rank'].padStart(4)}. ${record['Full Name'].padEnd(30)} (${record['Position']}) - Projected: ${record['Projected Points']} pts`);
    }
  }
}

if (naCount > 10) {
  console.log(`... and ${naCount - 10} more with N/A values in the first 283 players`);
}

// Check what the app might be doing - look at the services
console.log('\n\nHYPOTHESIS: The app might be converting N/A values to default $1 or calculating them');
console.log('Check the canonicalService.ts or other data loading services to see how they handle N/A values');