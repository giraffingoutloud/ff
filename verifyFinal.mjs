import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse adp1 with correct column indices
function parseADP1Correctly(text) {
    const lines = text.split('\n').filter(line => line.trim());
    const rows = [];
    
    for (let i = 2; i < lines.length && i < 10; i++) { // Just check first few rows
        const values = lines[i].split(',').map(v => v.trim());
        rows.push({
            name: values[1],          // Column 2: Name
            team: values[2],          // Column 3: Team
            pos: values[3],           // Column 4: Position
            espn_adp: values[6],      // Column 7: ESPN ADP (first ESPN column)
            espn_aav: values[13],     // Column 14: ESPN AAV (second ESPN column)
            injury: values[15]        // Column 16: Injury
        });
    }
    return rows;
}

console.log('='.repeat(70));
console.log('FINAL VERIFICATION: CORRECT ESPN ADP VALUES');
console.log('='.repeat(70));

const adp1Path = path.join(__dirname, 'canonical_data/adp/adp1_2025.csv');
const adp1Text = fs.readFileSync(adp1Path, 'utf-8');
const players = parseADP1Correctly(adp1Text);

console.log('\nTop Players from adp1_2025.csv:');
console.log('Name                | ESPN ADP | ESPN AAV | Injury');
console.log('-'.repeat(60));

players.forEach(p => {
    const name = p.name.padEnd(18);
    const adp = (p.espn_adp || 'N/A').padStart(8);
    const aav = ('$' + (p.espn_aav || 'N/A')).padStart(9);
    const injury = p.injury || 'Healthy';
    console.log(`${name} | ${adp} | ${aav} | ${injury}`);
});

console.log('\n' + '='.repeat(70));
console.log('EXPECTED BEHAVIOR:');
console.log('='.repeat(70));
console.log('✓ App should use ESPN ADP values (1.56, 1.60, etc.) NOT auction values');
console.log('✓ App should use auction values from adp0_2025.csv ($59, $57, etc.)');
console.log('✗ App should NOT use injury data from adp1');
console.log('\n' + '='.repeat(70));