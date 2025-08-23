import { improvedCanonicalService } from '../services/improvedCanonicalService';

export async function testADPLoading() {
  console.log('='.repeat(70));
  console.log('TESTING DUAL ADP LOADING');
  console.log('='.repeat(70));
  
  const players = await improvedCanonicalService.initialize();
  
  // Check specific players
  const testPlayers = ["Ja'Marr Chase", "Bijan Robinson", "Justin Jefferson", "CeeDee Lamb", "Tyreek Hill"];
  
  const results = testPlayers.map(name => {
    const player = players.find(p => p.name === name);
    return {
      name,
      position: player?.position || 'N/A',
      adp: player?.adp || 0,
      auctionValue: player?.auctionValue || 0
    };
  });
  
  console.table(results);
  
  return {
    totalPlayers: players.length,
    withADP: players.filter(p => p.adp && p.adp > 0 && p.adp < 500).length,
    withAuction: players.filter(p => p.auctionValue && p.auctionValue > 0).length,
    topPlayers: results
  };
}

// Make it available globally for testing
(window as any).testADPLoading = testADPLoading;