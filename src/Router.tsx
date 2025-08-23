import React, { useState, useEffect } from 'react';
import App from './App';
import { MethodologyPage } from './pages/MethodologyPage';
import { AuctionCommandPage } from './pages/AuctionCommandPage';

export const Router: React.FC = () => {
  const [currentHash, setCurrentHash] = useState(window.location.hash.slice(1));
  
  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash.slice(1));
    };
    
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);
  
  // Use hash-based routing for GitHub Pages compatibility
  if (currentHash === '/methodology') {
    return <MethodologyPage />;
  }
  
  if (currentHash === '/auction-command') {
    return <AuctionCommandPage />;
  }
  
  // Default to main app
  return <App />;
};