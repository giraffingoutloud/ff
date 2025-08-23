import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read and parse CSV files
function parseCSV(text) {
    const lines = text.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim().replace(/["\uFEFF]/g, ''));
    const rows = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        rows.push(row);
    }
    return { headers, rows };
}

// Special parsing for adp1 with multi-row headers
function parseADP1(text) {
    const lines = text.split('\n').filter(line => line.trim());
    // Skip first line (category headers), use second line as actual headers
    const headers = lines[1].split(',').map(h => h.trim());
    const rows = [];
    
    for (let i = 2; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        rows.push(row);
    }
    return { headers, rows };
}

console.log('='.repeat(70));
console.log('DUAL ADP DATA VERIFICATION');
console.log('='.repeat(70));

// Load adp0
const adp0Path = path.join(__dirname, 'canonical_data/adp/adp0_2025.csv');
const adp0Text = fs.readFileSync(adp0Path, 'utf-8');
const adp0Data = parseCSV(adp0Text);
console.log(`\nLoaded adp0_2025.csv: ${adp0Data.rows.length} rows`);
console.log('Headers:', adp0Data.headers.slice(0, 5).join(', '), '...');

// Load adp1
const adp1Path = path.join(__dirname, 'canonical_data/adp/adp1_2025.csv');
const adp1Text = fs.readFileSync(adp1Path, 'utf-8');
const adp1Data = parseADP1(adp1Text);
console.log(`\nLoaded adp1_2025.csv: ${adp1Data.rows.length} rows`);
console.log('Headers:', adp1Data.headers.slice(0, 7).join(', '), '...');

// Check specific players
const testPlayers = ["Ja'Marr Chase", "Bijan Robinson", "Justin Jefferson", "CeeDee Lamb", "Tyreek Hill"];

console.log('\n' + '='.repeat(50));
console.log('PLAYER DATA COMPARISON:');
console.log('='.repeat(50));

for (const playerName of testPlayers) {
    const adp0Player = adp0Data.rows.find(r => r['Full Name'] === playerName);
    const adp1Player = adp1Data.rows.find(r => r['Name'] === playerName);
    
    console.log(`\n${playerName}:`);
    
    if (adp0Player) {
        console.log(`  adp0 - ADP: ${adp0Player['ADP']}, Auction: $${adp0Player['Auction Value']}`);
    } else {
        console.log('  adp0 - NOT FOUND');
    }
    
    if (adp1Player) {
        console.log(`  adp1 - ESPN ADP: ${adp1Player['ESPN']}, Name: "${adp1Player['Name']}"`);
        // Check if injury data exists
        if (adp1Player['Injury']) {
            console.log(`  adp1 - INJURY DATA: ${adp1Player['Injury']} (should NOT be used)`);
        }
    } else {
        console.log('  adp1 - NOT FOUND');
    }
}

// Summary
console.log('\n' + '='.repeat(50));
console.log('SUMMARY:');
console.log('='.repeat(50));

const adp0WithAuction = adp0Data.rows.filter(r => r['Auction Value'] && r['Auction Value'] !== 'N/A').length;
const adp1WithESPN = adp1Data.rows.filter(r => r['ESPN'] && r['ESPN'] !== '').length;
const adp1WithInjury = adp1Data.rows.filter(r => r['Injury'] && r['Injury'] !== '').length;

console.log(`adp0 players with auction values: ${adp0WithAuction}`);
console.log(`adp1 players with ESPN ADP: ${adp1WithESPN}`);
console.log(`adp1 players with injury data: ${adp1WithInjury} (should be ignored)`);

console.log('\n' + '='.repeat(70));
console.log('TEST COMPLETE');
console.log('='.repeat(70));