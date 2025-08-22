/**
 * Improved Canonical Data Service
 * 
 * Features:
 * 1. Loads unique player projections from canonical CSV data
 * 2. Fetches age/experience from Sleeper API (with caching)
 * 3. Merges ADP (Average Draft Position) data
 * 4. Loads SOS (Strength of Schedule) data for each team
 * 5. Filters to only fantasy-relevant players
 * 6. Provides real-time injury and news updates
 * 7. Ensures no data duplication
 */

import { Player, Position } from '../types';
import { parseCSV, ParsedCSVRow } from '../utils/csvParser';
import { correctRookieStatus } from '../data/rookie_corrections';
import { correctPlayerAge } from '../data/age_corrections';
import { correctPlayerExperience } from '../data/experience_corrections';
import { dataValidator } from './dataValidator';
import { nameNormalizer } from './nameNormalizer';
import { hallucinationDetector } from './hallucinationDetector';
import { dataProvenanceChecker } from './dataProvenanceChecker';
import { realtimeDataService } from './realtimeDataService';
import { evaluationEngine } from './unifiedEvaluationEngine';
import { ExtendedPlayer } from './pprAnalyzer';

// Import canonical data files
import allProjections from '../../canonical_data/projections/qb_projections_2025.csv?raw';
import mainADP from '../../canonical_data/adp/adp0_2025.csv?raw';
import sosData from '../../canonical_data/strength_of_schedule/sos_2025.csv?raw';

// Cache for Sleeper player data
let sleeperPlayerCache: Map<string, any> | null = null;
let sleeperLastUpdated: Date | null = null;

export class ImprovedCanonicalService {
  private players: Map<string, ExtendedPlayer> = new Map();
  private isInitialized = false;
  private initCount = 0;
  
  /**
   * Initialize with improved data handling
   */
  async initialize(): Promise<Player[]> {
    this.initCount++;
    if (this.isInitialized) {
      console.log(`Service already initialized with ${this.players.size} players`);
      return Array.from(this.players.values());
    }
    
    
    try {
      // Step 1: Fetch Sleeper data ONCE for age/experience
      await this.fetchSleeperMetadata();
      await this.loadUniqueProjections();
      await this.loadADPData();
      await this.loadSOSData();
      this.filterFantasyRelevant();
      this.startRealtimeUpdates();
      
      this.isInitialized = true;
      
      const playersArray = Array.from(this.players.values());
      console.log(`\n✅ Initialization complete with ${playersArray.length} total players`);
      
      // Run data validation (flags issues but doesn't fix them)
      console.log('\n🔍 Running data validation...');
      dataValidator.validateAllPlayers(playersArray);
      
      // Run hallucination detection
      console.log('\n🧠 Running hallucination detection...');
      const hallucinationIssues = hallucinationDetector.detectHallucinations(playersArray);
      const hallucinationSummary = hallucinationDetector.getSummary();
      
      if (hallucinationSummary.total > 0) {
        console.log(`\n⚠️ Hallucination Detection Results:`);
        console.log(`  Total issues: ${hallucinationSummary.total}`);
        console.log(`  High confidence: ${hallucinationSummary.high}`);
        console.log(`  Medium confidence: ${hallucinationSummary.medium}`);
        console.log(`  Low confidence: ${hallucinationSummary.low}`);
        
        // Show first few high-confidence issues
        const highConfidence = hallucinationDetector.getHighConfidenceIssues();
        if (highConfidence.length > 0) {
          console.log('\n  Critical issues:');
          highConfidence.slice(0, 5).forEach(issue => {
            console.log(`    - ${issue.description}`);
          });
        }
      } else {
        console.log('✅ No hallucinations detected');
      }
      
      // Check data provenance (verify all data from legitimate sources)
      console.log('\n📊 Checking data provenance...');
      const provenanceIssues = await dataProvenanceChecker.checkDataProvenance();
      const provenanceSummary = dataProvenanceChecker.getSummary();
      
      if (provenanceSummary.total > 0) {
        console.log(`\n⚠️ Data Provenance Check Results:`);
        console.log(`  Total issues: ${provenanceSummary.total}`);
        console.log(`  Critical: ${provenanceSummary.critical}`);
        console.log(`  Warnings: ${provenanceSummary.warnings}`);
        console.log(`  Data Legitimacy: ${provenanceSummary.isLegitimate ? '✅ VERIFIED' : '❌ SUSPICIOUS'}`);
        
        const criticalIssues = dataProvenanceChecker.getCriticalIssues();
        if (criticalIssues.length > 0) {
          console.log('\n  Critical provenance issues:');
          criticalIssues.slice(0, 3).forEach(issue => {
            console.log(`    - ${issue.location}: ${issue.description}`);
          });
        }
      } else {
        console.log('✅ All data from canonical sources verified');
      }
      
      
      evaluationEngine.initializeWithPlayers(playersArray);
      
      return playersArray;
    } catch (error) {
      console.error('Failed to initialize:', error);
      throw error;
    }
  }
  
  /**
   * Fetch Sleeper data for age/experience
   */
  private async fetchSleeperMetadata(): Promise<void> {
    // Always fetch fresh data - no caching to ensure up-to-date info
    console.log('[Data Refresh] Fetching latest Sleeper player data...');
    
    try {
      const response = await fetch('https://api.sleeper.app/v1/players/nfl');
      if (!response.ok) {
        throw new Error(`Sleeper API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Update timestamp
      sleeperLastUpdated = new Date();
      console.log(`[Sleeper API] Data fetched at ${sleeperLastUpdated.toLocaleString()}`);
      
      sleeperPlayerCache = new Map();
      
      // Build cache by player name
      Object.values(data as any).forEach((player: any) => {
        if (player.full_name && player.active) {
          sleeperPlayerCache!.set(player.full_name.toLowerCase(), {
            age: player.age || 26,
            experience: player.years_exp || 0,
            team: player.team,
            position: player.position,
            injury_status: player.injury_status
          });
        }
      });
      
      console.log(`[Data Refresh] Loaded ${sleeperPlayerCache!.size} players from Sleeper API at ${new Date().toISOString()}`);
    } catch (error) {
      console.warn('[Data Refresh] Failed to fetch Sleeper data, using empty cache:', error);
      sleeperPlayerCache = new Map();
    }
  }
  
  /**
   * Load unique projections (no duplicates)
   */
  private async loadUniqueProjections(): Promise<void> {
    // Load projections from CSV
    
    // IMPORTANT: Each projection file contains ALL players, not just that position
    // So we only need to load ONE file to get everyone
    const projectionRows = parseCSV(allProjections);
    
    // Parse projection data
    
    let totalRows = 0;
    let uniquePlayers = 0;
    
    projectionRows.forEach(row => {
      totalRows++;
      
      const playerName = row.playerName || row.name || row.Player;
      const position = row.position || row.Position || row.Pos;
      const team = row.teamName || row.team || row.Team;
      
      if (!playerName || !position) {
        return;
      }
      
      
      // Skip if we already have this player
      if (this.players.has(playerName)) {
        return;
      }
      
      // Map position (handle various formats)
      const posMap: Record<string, Position> = {
        'qb': 'QB', 'rb': 'RB', 'wr': 'WR',
        'te': 'TE', 'k': 'K', 'dst': 'DST',
        'def': 'DST', 'd/st': 'DST'
      };
      
      const cleanPosition = position.toLowerCase().trim();
      const mappedPosition = posMap[cleanPosition] || position.toUpperCase();
      
      // Only include fantasy-relevant positions
      if (!['QB', 'RB', 'WR', 'TE', 'K', 'DST'].includes(mappedPosition)) {
        return;
      }
      
      // Get metadata from Sleeper cache (but not for DST)
      // Use name normalizer to find best match
      let sleeperData = null;
      if (mappedPosition !== 'DST' && sleeperPlayerCache) {
        // Try direct match first
        sleeperData = sleeperPlayerCache.get(playerName.toLowerCase());
        
        // If no direct match, try normalized variations
        if (!sleeperData) {
          const variations = nameNormalizer.getVariations(playerName);
          for (const variation of variations) {
            sleeperData = sleeperPlayerCache.get(variation.toLowerCase());
            if (sleeperData) break;
          }
        }
      }
      
      // Get bye week from CSV data (all players have bye week data)
      const byeWeek = row.byeWeek ? parseInt(row.byeWeek) : 0;
      
      // Use real data from Sleeper or mark as unknown (0 means unknown)
      // Only DST gets 0 for age/experience (team unit, not a player)
      const rawAge = (mappedPosition === 'DST') ? 0 : (sleeperData?.age || 0);
      const age = correctPlayerAge({ name: playerName, age: rawAge, position: mappedPosition });
      const rawExperience = (mappedPosition === 'DST') ? 0 : (sleeperData?.experience ?? 0);
      const experience = correctPlayerExperience({ name: playerName, experience: rawExperience });
      
      // Parse PPR-relevant stats
      const rushAttempts = parseFloat(row.rushAtt || '0');
      const rushYards = parseFloat(row.rushYds || '0');
      const rushTDs = parseFloat(row.rushTd || '0');
      const targets = parseFloat(row.recvTargets || '0');
      const receptions = parseFloat(row.recvReceptions || '0');
      const receivingYards = parseFloat(row.recvYds || '0');
      const receivingTDs = parseFloat(row.recvTd || '0');
      
      // DO NOT use auction value from projections - only from ADP file
      // Set to 0 initially, will be updated from ADP if player has valid auction value
      const auctionValue = 0; // Will be set from ADP file only
      // Use 999 as default ADP (will be updated from ADP file if player exists there)
      const estimatedADP = 999;
      
      const player: ExtendedPlayer = {
        id: `player-${playerName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        name: playerName,
        team: team || 'FA',
        position: mappedPosition as Position,
        age,
        experience,
        byeWeek,
        adp: estimatedADP,
        auctionValue: auctionValue, // Store actual auction value separately
        projectedPoints: parseFloat(row.fantasyPoints || row.points || '0'),
        cvsScore: 0, // Calculated dynamically
        injuryStatus: (sleeperData?.injury_status ? 
          this.mapInjuryStatus(sleeperData.injury_status) : 'Healthy') as Player['injuryStatus'],
        news: [],
        // PPR-specific stats
        rushAttempts,
        rushYards,
        rushTDs,
        targets,
        receptions,
        receivingYards,
        receivingTDs
      };
      
      
      this.players.set(playerName, player);
      uniquePlayers++;
      
    });
    
    console.log(`Loaded ${uniquePlayers} unique players from projections`);
    console.log(`Total players in map after projections: ${this.players.size}`);
  }
  
  /**
   * Load ADP data and merge with existing players
   */
  private async loadADPData(): Promise<void> {
    console.log(`Players before loadADPData: ${this.players.size}`);
    // Clean the CSV content first
    const cleanedADP = mainADP
      .replace(/^\uFEFF/, '') // Remove BOM
      .replace(/\r\n/g, '\n') // Normalize line endings
      .split('\n')
      .filter(line => line.trim() && !line.includes('Draft-rankings-export')) // Remove title and empty lines
      .join('\n');
    
    const rows = parseCSV(cleanedADP);
    let matches = 0;
    let notFound: string[] = [];
    let dstKAdded = 0;
    
    // Process ADP data
    
    // Don't skip rows - parseCSV should handle headers
    rows.forEach((row, index) => {
      const playerName = row['Full Name'] || row.name || row.Player;
      const position = row.Position || row.position;
      const team = row['Team Abbreviation'] || row.Team || row.team;
      
      // Parse ADP - if it's null, keep it as 0 (which means no valid ADP)
      const adpValue = row.ADP || row.adp;
      let adp = 0;
      if (adpValue && adpValue !== 'null' && adpValue !== '') {
        adp = parseFloat(adpValue);
      }
      // Do NOT use Overall Rank as fallback - null ADP means no ADP
      
      // Handle N/A auction values - keep as 0 which UI will show as "N/A"
      const auctionValueStr = row['Auction Value'] || row.auctionValue || '0';
      const auctionValue = (auctionValueStr === 'N/A' || auctionValueStr === '') ? 0 : parseFloat(auctionValueStr);
      const isRookie = row['Is Rookie'] === 'Yes';
      const dataStatus = row['Data Status'] || 'Unknown';
      const projectedPoints = parseFloat(row['Projected Points'] || '0');
      
      // Process ALL players with names, even if they have N/A auction values
      if (playerName) {
        // Try exact match first
        let player = this.players.get(playerName);
        
        // If no exact match and it's a DST, try simplified name
        if (!player && position === 'DST' && playerName.includes(' DST')) {
          // Try multiple name formats for DST
          const nameParts = playerName.replace(' DST', '').split(' ');
          
          // Try last word + DST (e.g., "Buffalo Bills DST" -> "Bills DST")
          const lastWord = nameParts[nameParts.length - 1];
          player = this.players.get(`${lastWord} DST`);
          
          if (!player && nameParts.length > 1) {
            // Try first word + DST (e.g., "San Francisco 49ers DST" -> "49ers DST")
            // But handle special cases like "49ers" which might be the second word
            for (const word of nameParts) {
              const tryName = `${word} DST`;
              const found = this.players.get(tryName);
              if (found) {
                player = found;
                break;
              }
            }
          }
          
          if (!player) {
            // Also try with just team abbreviation
            const teamDST = `${team} DST`;
            player = this.players.get(teamDST);
          }
        }
        
        if (player) {
          // Update existing player
          if (adp > 0) player.adp = adp;
          // Apply age correction if player has missing age data
          if (!player.age || player.age === 0) {
            player.age = correctPlayerAge({ name: playerName, age: player.age, position: player.position });
          }
          // Set auction value even if 0 (will show as N/A in UI)
          const prevAuction = player.auctionValue;
          player.auctionValue = auctionValue;
          
          if (auctionValue > 0 && prevAuction === 0) {
            console.log(`Updated ${playerName} auction: ${prevAuction} -> ${auctionValue}`);
          }
          
          // Add rookie and data status flags with corrections
          (player as any).isRookie = correctRookieStatus({ name: playerName, isRookie });
          (player as any).dataStatus = dataStatus;
          
          matches++;
          
        } else if (position === 'DST' || position === 'K') {
          // ONLY add if we truly don't have this DST/K already
          // Check if we already have this DST under a different name
          let alreadyExists = false;
          
          if (position === 'DST') {
            // For DST, check if we have a matching short name
            const shortName = this.extractDSTShortName(playerName);
            console.log(`Checking DST: "${playerName}" -> short name: "${shortName}"`);
            
            this.players.forEach((existingPlayer, existingName) => {
              if (existingPlayer.position === 'DST') {
                const existingShort = existingName.replace(' DST', '').split(' ').pop();
                if (existingShort && existingShort.toLowerCase() === shortName.toLowerCase()) {
                  console.log(`  Found match: "${existingName}" matches "${playerName}"`);
                  alreadyExists = true;
                }
              }
            });
          } else if (position === 'K') {
            // For kickers, check by player name (they might exist)
            // Kickers from projections should match by name
            alreadyExists = false; // Kickers should add if not found
          }
          
          if (alreadyExists) {
            // Skip - we already have this DST under a different name
            console.log(`SKIPPING duplicate DST: ${playerName}`);
            notFound.push(`${playerName} (DST duplicate skipped)`);
          } else {
            // Add DST/K players from ADP file (they don't exist in projections)
            // ONLY use actual data from the CSV, no made-up values
            const byeWeek = parseInt(row['Bye Week'] || '0') || 0;
          
          const newPlayer: ExtendedPlayer = {
            id: `${playerName.toLowerCase().replace(/\s+/g, '-')}`,
            name: playerName,
            team: team || '',
            position: position as Position,
            age: position === 'DST' ? 0 : 0, // DST is team unit (0), Kickers have real ages but we don't have data (0 = unknown)
            experience: position === 'DST' ? 0 : 0, // Similar - 0 means unknown for kickers
            byeWeek: byeWeek || 0,
            bye: byeWeek || 0,
            adp: adp || 999, // Use actual ADP from file or default to 999 (undrafted)
            auctionValue: auctionValue || 0, // Use actual auction value from file
            projectedPoints: projectedPoints || 0, // Use actual projection from file
            cvsScore: 0, // Will be calculated later
            injuryStatus: 'Healthy',
            // PPR stats (not applicable to DST/K)
            rushAttempts: 0,
            rushYards: 0,
            rushTDs: 0,
            targets: 0,
            receptions: 0,
            receivingYards: 0,
            receivingTDs: 0,
            pprValue: 0,
            targetShare: 0,
            catchRate: 0,
            isRookie: correctRookieStatus({ name: playerName, isRookie: false }), // Apply corrections
            dataStatus: dataStatus as any
          };
          
          this.players.set(playerName, newPlayer);
          dstKAdded++;
          }
          
        } else if (adp < 50) {
          // Track high ADP players we couldn't match
          notFound.push(`${playerName} (ADP: ${adp})`);
        }
      }
    });
    
    // Count how many have auction values
    let withAuction = 0;
    let withADP = 0;
    this.players.forEach(p => {
      if (p.auctionValue && p.auctionValue > 0) withAuction++;
      if (p.adp && p.adp > 0 && p.adp < 500) withADP++;
    });
    
    console.log(`ADP Matching: ${matches} updated, ${dstKAdded} new DST/K added`);
    console.log(`Total players after ADP merge: ${this.players.size}`);
    console.log(`Players with auction values: ${withAuction}`);
    console.log(`Players with valid ADP: ${withADP}`);
    
  }
  
  /**
   * Load SOS (Strength of Schedule) data
   */
  private async loadSOSData(): Promise<void> {
    console.log('Loading SOS data...');
    
    // Parse SOS CSV
    const cleanedSOS = sosData
      .replace(/^\uFEFF/, '') // Remove BOM
      .replace(/\r\n/g, '\n') // Normalize line endings
      .split('\n')
      .filter(line => line.trim())
      .join('\n');
    
    const rows = parseCSV(cleanedSOS);
    let sosUpdates = 0;
    
    // Process each row - teams in SOS data match teams in player data
    rows.forEach(row => {
      const offense = row['Offense'];
      const seasonSOS = row['Season SOS'];
      
      if (!offense || !seasonSOS) return;
      
      // Use team abbreviation as-is (they match the player data)
      const team = offense;
      
      // Parse SOS value (0-10 scale, lower is easier)
      const sosValue = parseFloat(seasonSOS);
      if (isNaN(sosValue)) {
        console.log(`Invalid SOS value for ${team}: "${seasonSOS}"`);
        return;
      }
      
      // Debug NYG specifically
      if (team === 'NYG') {
        console.log(`Processing NYG SOS: team="${team}", sosValue=${sosValue}`);
        let nygCount = 0;
        this.players.forEach(player => {
          if (player.team === 'NYG') {
            nygCount++;
          }
        });
        console.log(`Found ${nygCount} NYG players in data`);
      }
      
      // Update all players on this team
      this.players.forEach(player => {
        if (player.team === team) {
          player.sos = sosValue;
          sosUpdates++;
          // Debug NYG players
          if (team === 'NYG') {
            console.log(`Updated NYG player: ${player.name} with SOS ${sosValue}`);
          }
        }
      });
    });
    
    console.log(`SOS data loaded: ${sosUpdates} players updated`);
  }
  
  /**
   * Extract short name from DST full name
   * e.g., "Buffalo Bills DST" -> "Bills"
   */
  private extractDSTShortName(fullName: string): string {
    const name = fullName.replace(' DST', '');
    const parts = name.split(' ');
    // Usually the last word is the team name (Bills, 49ers, etc.)
    return parts[parts.length - 1];
  }
  
  /**
   * Filter to only fantasy-relevant players
   * REMOVES players with missing auction values or null ADP (except K/DST)
   */
  private filterFantasyRelevant(): void {
    const before = this.players.size;
    const relevantPlayers = new Map<string, ExtendedPlayer>();
    
    // Track why players are filtered
    let noAuctionValue = 0;
    let noADP = 0;
    let noPoints = 0;
    let kept = 0;
    
    // NEW CRITERIA per user requirements:
    // 1. Remove ALL non-K/DST players with missing auction values (0 or N/A)
    // 2. Remove ALL non-K/DST players with null/missing ADP (999 or 0)
    // 3. Keep ALL K and DST players regardless of missing data
    
    this.players.forEach((player, name) => {
      // Always keep DST and K regardless of missing data
      if (player.position === 'DST' || player.position === 'K') {
        relevantPlayers.set(name, player);
        kept++;
        return;
      }
      
      // For non-K/DST players, EXCLUDE if missing auction value or ADP
      const hasValidAuctionValue = (player.auctionValue || 0) > 0; // 0 means N/A
      const hasValidADP = player.adp > 0 && player.adp < 500; // 999 means null, 0 means missing
      
      // Must have BOTH valid auction value AND valid ADP
      if (!hasValidAuctionValue) {
        noAuctionValue++;
        if (player.adp < 20) {
          console.log(`Removing ${player.name} (${player.position}): no auction (${player.auctionValue}), ADP=${player.adp}`);
        }
        return; // Filter out
      }
      
      if (!hasValidADP) {
        noADP++;
        console.log(`Removing ${player.name}: no ADP (${player.adp})`);
        return; // Filter out
      }
      
      // Keep the player - they have both auction value and ADP
      relevantPlayers.set(name, player);
      kept++;
    });
    
    console.log(`=== FILTERING SUMMARY ===`);
    console.log(`Before filtering: ${before} players`);
    console.log(`After filtering: ${kept} players`);
    console.log(`Removed ${before - kept} players total:`);
    console.log(`  - ${noAuctionValue} with no auction value`);
    console.log(`  - ${noADP} with no ADP`);
    console.log(`Kept all K/DST positions regardless of missing data`);
    
    this.players = relevantPlayers;
  }
  
  /**
   * Estimate age based on position and ADP
   * Uses statistical averages for each position
   */
  private estimateAge(position: Position, adp: number): number {
    // Average ages by position in NFL (2024 data)
    const positionAverages: Record<Position, number> = {
      QB: 28,  // QBs tend to be older
      RB: 25,  // RBs are youngest on average
      WR: 26,  // WRs slightly older than RBs
      TE: 27,  // TEs take time to develop
      K: 29,   // Kickers have longer careers
      DST: 0   // Not applicable for DST
    };
    
    // Adjust based on ADP (earlier picks tend to be in their prime)
    let baseAge = positionAverages[position] || 26;
    
    if (position !== 'DST') {
      if (adp < 50) {
        baseAge -= 1; // Elite players are often in their prime (slightly younger)
      } else if (adp > 200) {
        baseAge += 2; // Late picks might be older veterans or very young unproven
      }
    }
    
    // Add some variance to avoid all being the same
    // Use player name hash for consistent but varied results
    const variance = this.hashCode(position + adp.toString()) % 5 - 2; // -2 to +2
    
    return Math.max(21, Math.min(35, baseAge + variance));
  }
  
  /**
   * Estimate experience based on age and position
   */
  private estimateExperience(age: number, position: Position): number {
    if (position === 'DST') return 0;
    
    // Most players enter NFL around 21-22
    const typicalEntryAge = position === 'QB' ? 22 : 21;
    const estimatedExp = Math.max(0, age - typicalEntryAge);
    
    // Cap at reasonable maximum
    return Math.min(estimatedExp, 15);
  }
  
  /**
   * Simple hash function for creating variance
   */
  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
  
  /**
   * Map Sleeper injury status
   */
  private mapInjuryStatus(status?: string): Player['injuryStatus'] {
    if (!status) return 'Healthy';
    
    const statusMap: Record<string, Player['injuryStatus']> = {
      'IR': 'IR',
      'Out': 'Out',
      'Doubtful': 'Doubtful',
      'Questionable': 'Questionable',
      'PUP': 'Out',
      'Sus': 'Out',
      'NA': 'Healthy'
    };
    
    return statusMap[status] || 'Questionable';
  }
  
  /**
   * Start real-time updates
   */
  private startRealtimeUpdates(): void {
    const playerNames = Array.from(this.players.keys());
    
    realtimeDataService.startPeriodicUpdates((updates) => {
      let updateCount = 0;
      
      // Log first update to see what we're getting
      if (updates.size > 0) {
        const firstUpdate = Array.from(updates.entries())[0];
        console.log('Sample real-time update:', firstUpdate);
      }
      
      updates.forEach((update, sleeperName) => {
        // Try to find matching player using name normalizer
        let matchedPlayer: ExtendedPlayer | undefined;
        let matchedName: string | undefined;
        
        // First try exact match
        matchedPlayer = this.players.get(sleeperName);
        if (matchedPlayer) {
          matchedName = sleeperName;
        } else {
          // Try to find a match using name variations
          for (const [canonicalName, player] of this.players) {
            if (nameNormalizer.match(canonicalName, sleeperName)) {
              matchedPlayer = player;
              matchedName = canonicalName;
              break;
            }
          }
        }
        
        if (matchedPlayer) {
          if (update.injuryStatus) {
            matchedPlayer.injuryStatus = update.injuryStatus as Player['injuryStatus'];
          }
          if (update.injuryNotes) {
            matchedPlayer.injuryNotes = update.injuryNotes;
            console.log(`Applying injury notes for ${matchedName || sleeperName}: "${update.injuryNotes}"`);
          }
          if (update.injuryBodyPart) matchedPlayer.injuryBodyPart = update.injuryBodyPart;
          if (update.practiceParticipation) matchedPlayer.practiceParticipation = update.practiceParticipation;
          if (update.practiceDescription) matchedPlayer.practiceDescription = update.practiceDescription;
          if (update.height) matchedPlayer.height = update.height;
          if (update.weight) matchedPlayer.weight = update.weight;
          if (update.depthChartPosition) matchedPlayer.depthChartPosition = update.depthChartPosition;
          if (update.depthChartOrder !== undefined) matchedPlayer.depthChartOrder = update.depthChartOrder;
          // Special case for Matthew Stafford
          if ((matchedName || sleeperName).includes('Stafford')) {
            console.log(`Stafford update:`, update);
            console.log(`Stafford player after update:`, { 
              injuryStatus: matchedPlayer.injuryStatus, 
              injuryNotes: matchedPlayer.injuryNotes 
            });
          }
          if (update.team) matchedPlayer.team = update.team;
          if (update.trending) {
            matchedPlayer.news = [{
              id: Date.now(),
              playerId: matchedPlayer.id,
              date: new Date(),
              source: 'sleeper',
              headline: `Trending: ${update.trending} adds`,
              content: '',
              impact: 'neutral'
            }];
          }
          updateCount++;
        }
      });
      
      // Count physical data updates
      let physicalDataCount = 0;
      this.players.forEach(player => {
        if (player.height || player.weight || player.depthChartPosition) {
          physicalDataCount++;
        }
      });
      
      if (updateCount > 0) {
        console.log(`📡 Applied ${updateCount} real-time updates`);
        console.log(`📊 Players with physical data: ${physicalDataCount}`);
        // Trigger React re-render by updating the store
        if ((window as any).updatePlayersFromRealtime) {
          (window as any).updatePlayersFromRealtime();
        }
      }
    });
  }
  
  /**
   * Get all players
   */
  getAllPlayers(): ExtendedPlayer[] {
    if (!this.isInitialized) {
      throw new Error('Service not initialized');
    }
    // Make available for debugging
    (window as any).allPlayers = Array.from(this.players.values());
    return Array.from(this.players.values());
  }
  
  getSleeperLastUpdated(): Date | null {
    return sleeperLastUpdated;
  }
  
  /**
   * Get position counts
   */
  private getPositionCounts(): string {
    const counts: Record<string, number> = {};
    this.players.forEach(player => {
      counts[player.position] = (counts[player.position] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([pos, count]) => `${pos}:${count}`)
      .join(', ');
  }
  
  /**
   * Stop real-time updates
   */
  stopRealtimeUpdates(): void {
    realtimeDataService.stopPeriodicUpdates();
  }
  
  /**
   * Reset the service (for debugging)
   */
  reset(): void {
    console.log(`Resetting service (had ${this.players.size} players)`);
    this.players.clear();
    this.isInitialized = false;
    this.initCount = 0;
  }
  
  /**
   * Force reinitialization (clears and reloads)
   */
  async forceReinitialize(): Promise<Player[]> {
    this.reset();
    return this.initialize();
  }
}

// Export singleton
export const improvedCanonicalService = new ImprovedCanonicalService();