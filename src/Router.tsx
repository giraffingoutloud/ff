import React, { useState, useEffect } from 'react';
import App from './App';
import { MethodologyPage } from './pages/MethodologyPage';
import { AuctionCommandPage } from './pages/AuctionCommandPage';
import { LineupOptimizerPage } from './pages/LineupOptimizerPage';
import { LineupOptimizerPageSimple } from './pages/LineupOptimizerPageSimple';

export const Router: React.FC = () => {
  const [currentHash, setCurrentHash] = useState(window.location.hash.slice(1));
  
  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash.slice(1));
      console.log('Hash changed to:', window.location.hash.slice(1));
    };
    
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);
  
  console.log('Current hash:', currentHash);
  
  // Use hash-based routing for GitHub Pages compatibility
  if (currentHash === '/methodology') {
    return <MethodologyPage />;
  }
  
  if (currentHash === '/auction-command') {
    return <AuctionCommandPage />;
  }
  
  if (currentHash === '/lineup-optimizer') {
    console.log('Loading LineupOptimizerPage');
    try {
      return <LineupOptimizerPage />;
    } catch (error) {
      console.error('Error loading LineupOptimizerPage:', error);
      return <LineupOptimizerPageSimple />;
    }
  }
  
  // Default to main app
  return <App />;
};