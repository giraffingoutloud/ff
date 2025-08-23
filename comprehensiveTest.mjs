import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Color codes for terminal
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

function parseCSV(text, skipRows = 0) {
    const lines = text.split('\n').filter(line => line.trim());
    const headers = lines[skipRows].split(',').map(h => h.trim().replace(/["\uFEFF]/g, ''));
    const rows = [];
    
    for (let i = skipRows + 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        // For adp1, also store by column index
        values.forEach((val, idx) => {
            row[`col_${idx}`] = val;
        });
        rows.push(row);
    }
    return rows;
}

console.log('\n' + '='.repeat(70));
console.log(BLUE + 'COMPREHENSIVE DUAL ADP SYSTEM TEST' + RESET);
console.log('='.repeat(70));

// Load all data files
const adp0 = parseCSV(fs.readFileSync(path.join(__dirname, 'canonical_data/adp/adp0_2025.csv'), 'utf-8'));
const adp1 = parseCSV(fs.readFileSync(path.join(__dirname, 'canonical_data/adp/adp1_2025.csv'), 'utf-8'), 1);

console.log(`\n${YELLOW}DATA FILES LOADED:${RESET}`);
console.log(`  adp0_2025.csv: ${adp0.length} players`);
console.log(`  adp1_2025.csv: ${adp1.length} players`);

// Test 1: Verify correct column identification in adp1
console.log(`\n${YELLOW}TEST 1: Column Identification in adp1${RESET}`);
console.log('First player data from adp1:');
const firstPlayer = adp1[0];
console.log(`  Name: ${firstPlayer.col_1}`);
console.log(`  ESPN ADP (col 6): ${firstPlayer.col_6}`);
console.log(`  ESPN AAV (col 13): ${firstPlayer.col_13}`);
console.log(`  Injury (col 15): ${firstPlayer.col_15 || 'None'}`);

// Test 2: Sample player comparison
console.log(`\n${YELLOW}TEST 2: Player Data Comparison${RESET}`);
const testPlayers = ["Ja'Marr Chase", "Bijan Robinson", "Justin Jefferson", "CeeDee Lamb", "Tyreek Hill"];

let allTestsPassed = true;

testPlayers.forEach(name => {
    const p0 = adp0.find(r => r['Full Name'] === name);
    const p1 = adp1.find(r => r.col_1 === name); // col_1 is Name column
    
    console.log(`\n${name}:`);
    
    if (!p0 || !p1) {
        console.log(RED + '  ✗ Player not found in both files!' + RESET);
        allTestsPassed = false;
        return;
    }
    
    const adp0Value = parseFloat(p0['ADP']);
    const adp0Auction = parseFloat(p0['Auction Value']);
    const espnADP = parseFloat(p1.col_6);  // ESPN ADP column
    const espnAAV = parseFloat(p1.col_13); // ESPN AAV column
    const injury = p1.col_15;
    
    console.log(`  adp0: ADP=${adp0Value}, Auction=$${adp0Auction}`);
    console.log(`  adp1: ESPN ADP=${espnADP}, ESPN AAV=$${espnAAV}`);
    
    // Verify ESPN ADP is reasonable (1-300 range)
    if (espnADP > 0 && espnADP < 300) {
        console.log(GREEN + '  ✓ ESPN ADP value is reasonable' + RESET);
    } else {
        console.log(RED + '  ✗ ESPN ADP value seems wrong!' + RESET);
        allTestsPassed = false;
    }
    
    // Check if injury data exists (we should NOT use it)
    if (injury) {
        console.log(YELLOW + `  ⚠ Injury data present: "${injury}" (should be ignored)` + RESET);
    }
});

// Test 3: Verify no auction value confusion
console.log(`\n${YELLOW}TEST 3: Verify No Column Confusion${RESET}`);
const samplePlayers = adp1.slice(0, 5);
let confusionDetected = false;

samplePlayers.forEach(p => {
    const espnADP = parseFloat(p.col_6);
    const espnAAV = parseFloat(p.col_13);
    
    if (espnADP > 20) {
        console.log(RED + `  ✗ ${p.col_1}: ESPN ADP (${espnADP}) looks like auction value!` + RESET);
        confusionDetected = true;
        allTestsPassed = false;
    }
});

if (!confusionDetected) {
    console.log(GREEN + '  ✓ No column confusion detected' + RESET);
}

// Test 4: Coverage check
console.log(`\n${YELLOW}TEST 4: Data Coverage${RESET}`);
const adp0WithAuction = adp0.filter(r => r['Auction Value'] && r['Auction Value'] !== 'N/A' && parseFloat(r['Auction Value']) > 0).length;
const adp1WithESPN = adp1.filter(r => r.col_6 && r.col_6 !== '' && parseFloat(r.col_6) > 0 && parseFloat(r.col_6) < 300).length;
const adp1WithInjury = adp1.filter(r => r.col_15 && r.col_15 !== '').length;

console.log(`  Players with auction values (adp0): ${adp0WithAuction}`);
console.log(`  Players with ESPN ADP < 300 (adp1): ${adp1WithESPN}`);
console.log(`  Players with injury data (adp1): ${adp1WithInjury} ${YELLOW}(should be ignored)${RESET}`);

// Test 5: Expected app behavior
console.log(`\n${YELLOW}TEST 5: Expected App Behavior${RESET}`);
console.log('The app should:');
console.log(GREEN + '  ✓ Load ESPN ADP from adp1 column 6 (values like 1.56, 3.08, etc.)' + RESET);
console.log(GREEN + '  ✓ Load auction values from adp0 ($59, $57, etc.)' + RESET);
console.log(GREEN + '  ✓ Use adp0 ADP only as fallback if no ESPN ADP exists' + RESET);
console.log(RED + '  ✗ NOT use injury data from adp1' + RESET);
console.log(RED + '  ✗ NOT confuse ESPN AAV (column 13) with ESPN ADP (column 6)' + RESET);

// Final result
console.log('\n' + '='.repeat(70));
if (allTestsPassed) {
    console.log(GREEN + 'ALL TESTS PASSED! ✓' + RESET);
} else {
    console.log(RED + 'SOME TESTS FAILED! ✗' + RESET);
}
console.log('='.repeat(70) + '\n');