import React from 'react';
import App from './App';
import { MethodologyPage } from './pages/MethodologyPage';
import { AuctionCommandPage } from './pages/AuctionCommandPage';

export const Router: React.FC = () => {
  // Simple routing based on URL path
  const path = window.location.pathname;
  
  if (path === '/ff/methodology') {
    return <MethodologyPage />;
  }
  
  if (path === '/ff/auction-command') {
    return <AuctionCommandPage />;
  }
  
  // Default to main app
  return <App />;
};