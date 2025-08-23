/**
 * Yahoo Fantasy Data Analyzer
 * Processes downloaded Yahoo data to extract insights for improving our model
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'yahoo_data');

interface AuctionPick {
  player_name: string;
  player_key: string;
  position: string;
  team: string;
  cost: number;
  pick_number: number;
  drafting_team: string;
  nominating_team?: string;
}

interface InflationPoint {
  pick_number: number;
  cumulative_spent: number;
  expected_spent: number;
  inflation_rate: number;
  position: string;
}

export class YahooDataAnalyzer {
  private draftData: any[] = [];
  private auctionPicks: AuctionPick[] = [];
  
  /**
   * Load all draft data from saved files
   */
  loadDraftData(): void {
    console.log('Loading draft data...');
    
    const files = fs.readdirSync(DATA_DIR)
      .filter(f => f.startsWith('draft_') && f.endsWith('.json'));
    
    for (const file of files) {
      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(DATA_DIR, file), 'utf-8')
        );
        this.draftData.push(data);
        this.extractAuctionPicks(data);
      } catch (error) {
        console.error(`Failed to load ${file}:`, error);
      }
    }
    
    console.log(`Loaded ${this.draftData.length} drafts with ${this.auctionPicks.length} total picks`);
  }
  
  /**
   * Extract auction picks from Yahoo's complex data structure
   */
  private extractAuctionPicks(data: any): void {
    // Yahoo's data structure varies, but typically:
    // data.fantasy_content.league[1].draft_results[1].draft_result
    
    try {
      const results = data?.fantasy_content?.league?.[1]?.draft_results?.[1]?.draft_result;
      
      if (Array.isArray(results)) {
        for (const pick of results) {
          if (pick.cost) {  // Auction draft
            this.auctionPicks.push({
              player_name: pick.player_name || 'Unknown',
              player_key: pick.player_key,
              position: pick.position || 'Unknown',
              team: pick.team || 'Unknown',
              cost: parseInt(pick.cost),
              pick_number: parseInt(pick.pick),
              drafting_team: pick.team_key,
              nominating_team: pick.nominating_team_key
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to extract picks:', error);
    }
  }
  
  /**
   * Calculate actual inflation throughout drafts
   */
  calculateInflationCurve(): InflationPoint[] {
    const inflationPoints: InflationPoint[] = [];
    const totalBudget = 200 * 12; // $200 per team, 12 teams
    const totalPicks = 16 * 12; // 16 players per team
    
    let cumulativeSpent = 0;
    
    for (let i = 0; i < this.auctionPicks.length; i++) {
      const pick = this.auctionPicks[i];
      cumulativeSpent += pick.cost;
      
      const expectedSpent = (totalBudget * (i + 1)) / totalPicks;
      const inflationRate = cumulativeSpent / expectedSpent;
      
      inflationPoints.push({
        pick_number: i + 1,
        cumulative_spent: cumulativeSpent,
        expected_spent: expectedSpent,
        inflation_rate: inflationRate,
        position: pick.position
      });
    }
    
    return inflationPoints;
  }
  
  /**
   * Analyze position-specific inflation patterns
   */
  analyzePositionInflation(): Record<string, {
    avgCost: number;
    avgCostByTier: number[];
    inflationByPhase: number[];
  }> {
    const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
    const analysis: any = {};
    
    for (const pos of positions) {
      const posPicks = this.auctionPicks.filter(p => p.position === pos);
      
      // Sort by cost to identify tiers
      posPicks.sort((a, b) => b.cost - a.cost);
      
      // Calculate tier averages (top 5, 6-15, 16-30, etc.)
      const tiers = [
        posPicks.slice(0, 5),
        posPicks.slice(5, 15),
        posPicks.slice(15, 30),
        posPicks.slice(30)
      ];
      
      const tierAverages = tiers.map(tier => 
        tier.length > 0 
          ? tier.reduce((sum, p) => sum + p.cost, 0) / tier.length 
          : 0
      );
      
      // Calculate inflation by draft phase
      const phases = [
        posPicks.filter(p => p.pick_number <= 30),
        posPicks.filter(p => p.pick_number > 30 && p.pick_number <= 90),
        posPicks.filter(p => p.pick_number > 90 && p.pick_number <= 150),
        posPicks.filter(p => p.pick_number > 150)
      ];
      
      const phaseInflation = phases.map(phase => {
        if (phase.length === 0) return 1.0;
        
        // Compare to expected value (would need AAV data for proper comparison)
        const avgCost = phase.reduce((sum, p) => sum + p.cost, 0) / phase.length;
        // Rough estimate: assume linear decrease in value
        const expectedCost = Math.max(1, 40 - (phase[0]?.pick_number || 0) * 0.2);
        return avgCost / expectedCost;
      });
      
      analysis[pos] = {
        avgCost: posPicks.reduce((sum, p) => sum + p.cost, 0) / posPicks.length,
        avgCostByTier: tierAverages,
        inflationByPhase: phaseInflation
      };
    }
    
    return analysis;
  }
  
  /**
   * Identify position runs and their effects
   */
  findPositionRuns(): Array<{
    startPick: number;
    endPick: number;
    position: string;
    count: number;
    avgInflation: number;
  }> {
    const runs: any[] = [];
    const windowSize = 5;
    
    for (let i = 0; i < this.auctionPicks.length - windowSize; i++) {
      const window = this.auctionPicks.slice(i, i + windowSize);
      
      // Count positions in window
      const posCounts: Record<string, number> = {};
      for (const pick of window) {
        posCounts[pick.position] = (posCounts[pick.position] || 0) + 1;
      }
      
      // Check if any position has 3+ picks (run)
      for (const [pos, count] of Object.entries(posCounts)) {
        if (count >= 3) {
          // Calculate average cost inflation during run
          const runPicks = window.filter(p => p.position === pos);
          const avgCost = runPicks.reduce((sum, p) => sum + p.cost, 0) / runPicks.length;
          
          // Compare to pre-run average (previous 10 picks of same position)
          const priorPicks = this.auctionPicks
            .slice(0, i)
            .filter(p => p.position === pos)
            .slice(-10);
          
          const priorAvg = priorPicks.length > 0
            ? priorPicks.reduce((sum, p) => sum + p.cost, 0) / priorPicks.length
            : avgCost;
          
          const inflation = avgCost / priorAvg;
          
          runs.push({
            startPick: i + 1,
            endPick: i + windowSize,
            position: pos,
            count: count,
            avgInflation: inflation
          });
        }
      }
    }
    
    return runs;
  }
  
  /**
   * Generate comprehensive analysis report
   */
  generateReport(): void {
    console.log('\n========================================');
    console.log('YAHOO FANTASY DATA ANALYSIS REPORT');
    console.log('========================================\n');
    
    // Load data
    this.loadDraftData();
    
    if (this.auctionPicks.length === 0) {
      console.log('No auction data found. Please run fetchYahooData.js first.');
      return;
    }
    
    // 1. Overall Statistics
    console.log('1. OVERALL STATISTICS');
    console.log('---------------------');
    console.log(`Total Drafts Analyzed: ${this.draftData.length}`);
    console.log(`Total Auction Picks: ${this.auctionPicks.length}`);
    console.log(`Average Cost: $${(this.auctionPicks.reduce((sum, p) => sum + p.cost, 0) / this.auctionPicks.length).toFixed(2)}`);
    console.log(`Max Cost: $${Math.max(...this.auctionPicks.map(p => p.cost))}`);
    console.log(`Min Cost: $${Math.min(...this.auctionPicks.map(p => p.cost))}`);
    
    // 2. Inflation Curve
    console.log('\n2. INFLATION CURVE');
    console.log('------------------');
    const inflationCurve = this.calculateInflationCurve();
    const keyPoints = [10, 30, 60, 90, 120, 150, 180];
    
    for (const point of keyPoints) {
      const data = inflationCurve[point - 1];
      if (data) {
        console.log(`Pick ${point}: ${(data.inflation_rate * 100).toFixed(1)}% inflation`);
      }
    }
    
    // 3. Position-Specific Analysis
    console.log('\n3. POSITION INFLATION ANALYSIS');
    console.log('-------------------------------');
    const positionAnalysis = this.analyzePositionInflation();
    
    for (const [pos, data] of Object.entries(positionAnalysis)) {
      console.log(`\n${pos}:`);
      console.log(`  Average Cost: $${data.avgCost.toFixed(2)}`);
      console.log(`  Tier 1 (Top 5): $${data.avgCostByTier[0].toFixed(2)}`);
      console.log(`  Tier 2 (6-15): $${data.avgCostByTier[1].toFixed(2)}`);
      console.log(`  Tier 3 (16-30): $${data.avgCostByTier[2].toFixed(2)}`);
      console.log(`  Inflation by Phase:`);
      console.log(`    Early (1-30): ${(data.inflationByPhase[0] * 100).toFixed(1)}%`);
      console.log(`    Middle (31-90): ${(data.inflationByPhase[1] * 100).toFixed(1)}%`);
      console.log(`    Late (91-150): ${(data.inflationByPhase[2] * 100).toFixed(1)}%`);
      console.log(`    End (151+): ${(data.inflationByPhase[3] * 100).toFixed(1)}%`);
    }
    
    // 4. Position Runs
    console.log('\n4. POSITION RUN EFFECTS');
    console.log('------------------------');
    const runs = this.findPositionRuns();
    const significantRuns = runs
      .filter(r => r.avgInflation > 1.1)
      .sort((a, b) => b.avgInflation - a.avgInflation)
      .slice(0, 10);
    
    console.log('Top 10 Inflationary Position Runs:');
    for (const run of significantRuns) {
      console.log(`  Picks ${run.startPick}-${run.endPick}: ${run.count} ${run.position}s, ${((run.avgInflation - 1) * 100).toFixed(1)}% inflation`);
    }
    
    // 5. Key Insights
    console.log('\n5. KEY INSIGHTS FOR MODEL IMPROVEMENT');
    console.log('--------------------------------------');
    
    // Calculate actual vs linear spending
    const actualSpending = inflationCurve[29]?.inflation_rate || 1.0; // Pick 30
    console.log(`• Early draft (picks 1-30) sees ${((actualSpending - 1) * 100).toFixed(1)}% more spending than linear model assumes`);
    
    // Position-specific insights
    const rbInflation = positionAnalysis['RB']?.inflationByPhase[0] || 1.0;
    const qbInflation = positionAnalysis['QB']?.inflationByPhase[0] || 1.0;
    console.log(`• RBs see ${((rbInflation - 1) * 100).toFixed(1)}% inflation in early draft`);
    console.log(`• QBs see ${((qbInflation - 1) * 100).toFixed(1)}% inflation in early draft`);
    
    // Position run effects
    const avgRunInflation = significantRuns.length > 0
      ? significantRuns.reduce((sum, r) => sum + r.avgInflation, 0) / significantRuns.length
      : 1.0;
    console.log(`• Position runs cause average ${((avgRunInflation - 1) * 100).toFixed(1)}% price inflation`);
    
    // Save detailed report
    const reportPath = path.join(DATA_DIR, 'analysis_report.json');
    const report = {
      summary: {
        totalDrafts: this.draftData.length,
        totalPicks: this.auctionPicks.length,
        avgCost: this.auctionPicks.reduce((sum, p) => sum + p.cost, 0) / this.auctionPicks.length
      },
      inflationCurve: inflationCurve.filter((_, i) => keyPoints.includes(i + 1)),
      positionAnalysis,
      positionRuns: significantRuns,
      recommendations: {
        earlyDraftMultiplier: actualSpending,
        positionMultipliers: {
          RB: rbInflation,
          WR: positionAnalysis['WR']?.inflationByPhase[0] || 1.0,
          QB: qbInflation,
          TE: positionAnalysis['TE']?.inflationByPhase[0] || 1.0
        },
        runDetectionThreshold: 3,
        runInflationMultiplier: avgRunInflation
      }
    };
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nDetailed report saved to: ${reportPath}`);
  }
}

// Export for use in other modules
export default YahooDataAnalyzer;