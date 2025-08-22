// Helper to find players in the loaded data
export function findPlayerByName(players: any[], searchName: string) {
  const exactMatch = players.find(p => p.name === searchName);
  if (exactMatch) return exactMatch;
  
  const partialMatches = players.filter(p => 
    p.name.toLowerCase().includes(searchName.toLowerCase())
  );
  
  return partialMatches;
}

// Add to window for console debugging
if (typeof window !== 'undefined') {
  (window as any).findPlayer = (name: string) => {
    const players = (window as any).__players || [];
    const results = findPlayerByName(players, name);
    
    if (Array.isArray(results)) {
      console.table(results.map(p => ({
        name: p.name,
        team: p.team,
        position: p.position,
        auctionValue: p.auctionValue,
        adp: p.adp,
        cvs: p.cvsScore,
        points: p.projectedPoints
      })));
    } else if (results) {
      console.log('Found:', results);
    } else {
      console.log('Not found');
    }
    
    return results;
  };
}