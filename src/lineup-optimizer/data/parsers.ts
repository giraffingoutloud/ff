/**
 * CSV and text file parsers for canonical data
 */

import * as fs from 'fs';
import * as path from 'path';
import { 
  QBStrengthOfSchedule, 
  TeamPowerRating, 
  HistoricalStats, 
  ADPData, 
  OffenseProjection,
  KickerProjection,
  DSTProjection
} from './types';

function parseCSV(content: string): string[][] {
  const lines = content.trim().split('\n');
  return lines.map(line => {
    const matches = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
    return matches ? matches.map(m => m.replace(/^"|"$/g, '').trim()) : [];
  });
}

export function parseQBSOS(filePath: string): Map<string, QBStrengthOfSchedule> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const rows = parseCSV(content);
  const headers = rows[0];
  const result = new Map<string, QBStrengthOfSchedule>();
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const weeks = new Map<number, number | null>();
    
    // Parse weeks 1-18
    for (let w = 1; w <= 18; w++) {
      const weekCol = headers.indexOf(`W${w}`);
      if (weekCol >= 0 && row[weekCol]) {
        const val = row[weekCol].trim();
        weeks.set(w, val === '' ? null : parseInt(val));
      }
    }
    
    const qbSos: QBStrengthOfSchedule = {
      ovr: parseInt(row[0]),
      name: row[1],
      team: row[2],
      weeks
    };
    
    result.set(qbSos.name, qbSos);
  }
  
  return result;
}

export function parsePowerRatings(filePath: string): Map<string, TeamPowerRating> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const rows = parseCSV(content);
  const result = new Map<string, TeamPowerRating>();
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rating: TeamPowerRating = {
      team: row[0],
      pointSpreadRating: parseFloat(row[1]),
      qbRating: parseFloat(row[2]),
      sosToDate: row[3] === 'null' ? null : parseFloat(row[3]),
      sosRemaining: parseInt(row[4]),
      projectedWins: parseFloat(row[5]),
      playoffProb: parseFloat(row[6]),
      divisionProb: parseFloat(row[7]),
      confChampProb: parseFloat(row[8]),
      superBowlProb: parseFloat(row[9])
    };
    
    result.set(rating.team, rating);
  }
  
  return result;
}

export function parseHistoricalStats(filePath: string, isDST: boolean = false): Map<string, HistoricalStats> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const rows = parseCSV(content);
  const headers = rows[0];
  const result = new Map<string, HistoricalStats>();
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const getCol = (name: string) => {
      const idx = headers.indexOf(name);
      return idx >= 0 && row[idx] ? parseFloat(row[idx]) : 0;
    };
    
    let stats: HistoricalStats;
    
    if (isDST) {
      stats = {
        player: row[headers.indexOf('Team')],
        team: row[headers.indexOf('Team')],
        position: 'DST',
        games: getCol('Games'),
        fantasyPoints: getCol('Fantasy Points'),
        sacks: getCol('Sacks'),
        interceptions: getCol('Interceptions'),
        fumbles: getCol('Fumbles Recovered'),
        tds: getCol('Total TDs'),
        safeties: getCol('Safeties'),
        pointsAllowed: getCol('Points Allowed')
      };
    } else {
      const nameCol = headers.indexOf('Player Name') >= 0 ? 'Player Name' : 'Player';
      stats = {
        player: row[headers.indexOf(nameCol)],
        team: row[headers.indexOf('Team')],
        position: row[headers.indexOf('Position')],
        games: getCol('Games'),
        fantasyPoints: getCol('Fantasy Points'),
        passYds: getCol('Passing Yards'),
        passTd: getCol('Passing TDs'),
        passInt: getCol('Interceptions'),
        rushYds: getCol('Rushing Yards'),
        rushTd: getCol('Rushing TDs'),
        recYds: getCol('Receiving Yards'),
        recTd: getCol('Receiving TDs'),
        receptions: getCol('Receptions'),
        targets: getCol('Targets')
      };
    }
    
    result.set(stats.player, stats);
  }
  
  return result;
}

export function parseADP(filePath: string): Map<string, ADPData> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const result = new Map<string, ADPData>();
  
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 8) continue;
    
    const bestWorst = parts[6].split('/');
    const adpData: ADPData = {
      rank: parseInt(parts[0]),
      player: parts[1],
      position: parts[2],
      team: parts[3],
      adp: parseFloat(parts[5]),
      bestPick: parseInt(bestWorst[0]),
      worstPick: parseInt(bestWorst[1]),
      rosteredPct: parseFloat(parts[7])
    };
    
    result.set(adpData.player, adpData);
  }
  
  return result;
}

export function parseOffenseProjections(filePath: string): Map<string, OffenseProjection> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const rows = parseCSV(content);
  const headers = rows[0];
  const result = new Map<string, OffenseProjection>();
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const getCol = (name: string) => {
      const idx = headers.indexOf(name);
      return idx >= 0 && row[idx] ? parseFloat(row[idx]) : 0;
    };
    
    const proj: OffenseProjection = {
      rank: getCol('fantasyPointsRank'),
      playerName: row[headers.indexOf('playerName')],
      teamName: row[headers.indexOf('teamName')],
      position: row[headers.indexOf('position')].toUpperCase(),
      byeWeek: getCol('byeWeek'),
      games: getCol('games'),
      fantasyPoints: getCol('fantasyPoints'),
      auctionValue: getCol('auctionValue'),
      passComp: getCol('passComp'),
      passAtt: getCol('passAtt'),
      passYds: getCol('passYds'),
      passTd: getCol('passTd'),
      passInt: getCol('passInt'),
      rushAtt: getCol('rushAtt'),
      rushYds: getCol('rushYds'),
      rushTd: getCol('rushTd'),
      recvTargets: getCol('recvTargets'),
      recvReceptions: getCol('recvReceptions'),
      recvYds: getCol('recvYds'),
      recvTd: getCol('recvTd'),
      fumbles: getCol('fumbles'),
      fumblesLost: getCol('fumblesLost'),
      twoPt: getCol('twoPt')
    };
    
    result.set(proj.playerName, proj);
  }
  
  return result;
}

export function parseKickerProjections(filePath: string): Map<string, KickerProjection> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const rows = parseCSV(content);
  const headers = rows[0];
  const result = new Map<string, KickerProjection>();
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const getCol = (name: string) => {
      const idx = headers.indexOf(name);
      return idx >= 0 && row[idx] ? parseFloat(row[idx]) : 0;
    };
    
    const proj: KickerProjection = {
      rank: getCol('fantasyPointsRank'),
      playerName: row[headers.indexOf('playerName')],
      teamName: row[headers.indexOf('teamName')],
      byeWeek: getCol('byeWeek'),
      games: getCol('games'),
      fantasyPoints: getCol('fantasyPoints'),
      fgMade: getCol('fgMade'),
      fgAtt: getCol('fgAttempted'),
      fgPct: getCol('fgPct'),
      patMade: getCol('patMade'),
      patAtt: getCol('patAttempted')
    };
    
    result.set(proj.playerName, proj);
  }
  
  return result;
}

export function parseDSTProjections(filePath: string): Map<string, DSTProjection> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const rows = parseCSV(content);
  const headers = rows[0];
  const result = new Map<string, DSTProjection>();
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const getCol = (name: string) => {
      const idx = headers.indexOf(name);
      return idx >= 0 && row[idx] ? parseFloat(row[idx]) : 0;
    };
    
    const proj: DSTProjection = {
      teamName: row[headers.indexOf('teamName')],
      byeWeek: getCol('byeWeek'),
      games: getCol('games'),
      fantasyPoints: getCol('fantasyPoints'),
      sacks: getCol('sacks'),
      interceptions: getCol('interceptions'),
      fumRecoveries: getCol('fumbleRecoveries'),
      touchdowns: getCol('touchdowns'),
      safeties: getCol('safeties'),
      pointsAllowed: getCol('pointsAllowed'),
      yardsAllowed: getCol('yardsAllowed')
    };
    
    result.set(proj.teamName, proj);
  }
  
  return result;
}