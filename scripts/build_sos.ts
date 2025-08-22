/**
 * Minimal SOS builder that loads team schedules/defense rankings
 * from src/data/sos/2025.json and produces a simple player SOS map.
 */
import * as fs from 'fs';
import * as path from 'path';
import sosData from '../src/data/sos/2025.json';
import { Player } from '../src/types';

export class SOSBuilder {
  buildAllPlayerSOS(players: Player[]): Map<string, { scheduleScore: number }> {
    const result = new Map<string, { scheduleScore: number }>();
    const teamSchedules: Record<string, any> = (sosData as any).teamSchedules || {};
    const defenseRankings: Record<string, Record<string, number>> = (sosData as any).defenseRankings || {};

    players.forEach(player => {
      const team = player.team;
      const schedule = teamSchedules[team];
      if (!schedule) {
        result.set(player.id, { scheduleScore: 0.6 });
        return;
      }

      // Simple average of opponent difficulty versus the player's position group
      const opponents: string[] = schedule.opponents || [];
      const key = player.position === 'RB' ? 'vsRB' : player.position === 'WR' ? 'vsWR' : player.position === 'TE' ? 'vsTE' : 'vsQB';
      const table = defenseRankings[key] || {};
      const ranks = opponents.map(opp => table[opp]).filter((r: number) => typeof r === 'number');
      const avgRank = ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 16;
      // Convert rank (1 best defense) into a friendliness score (0.4 hard ... 0.8 easy)
      const normalized = 1 - (avgRank - 1) / 31; // 1 -> 1.0, 32 -> 0.0
      const scheduleScore = 0.4 + 0.4 * normalized;
      result.set(player.id, { scheduleScore });
    });

    return result;
  }

  generateReport(map: Map<string, { scheduleScore: number }>): string {
    let report = '=== STRENGTH OF SCHEDULE REPORT ===\n\n';
    report += `Players analyzed: ${map.size}\n`;
    return report;
  }
}

// CLI
async function main() {
  console.log('SOS build step complete (static input).');
  const outDir = path.join(__dirname, '../src/data/sos');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  // No file write for per-player here; run_full_analysis will compute in-memory map.
}

// Execute if run directly (guard for ESM)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hasRequire = typeof (globalThis as any).require !== 'undefined' && typeof (globalThis as any).module !== 'undefined';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (hasRequire && (require as any).main === (module as any)) {
  main().catch(console.error);
}