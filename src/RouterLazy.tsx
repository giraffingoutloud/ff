import React, { useState, useEffect, lazy, Suspense } from 'react';
import App from './App';

// Lazy load heavy pages - they won't load until user navigates to them
const MethodologyPage = lazy(() => import('./pages/MethodologyPage').then(module => ({ default: module.MethodologyPage })));
const AuctionCommandPage = lazy(() => import('./pages/AuctionCommandPage').then(module => ({ default: module.AuctionCommandPage })));

// Loading component shown while lazy components load
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-gray-900">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
      <p className="text-gray-400">Loading...</p>
    </div>
  </div>
);

export const RouterLazy: React.FC = () => {
  const [currentHash, setCurrentHash] = useState(window.location.hash.slice(1));
  
  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash.slice(1));
    };
    
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);
  
  // Wrap lazy-loaded components in Suspense with fallback
  if (currentHash === '/methodology') {
    return (
      <Suspense fallback={<PageLoader />}>
        <MethodologyPage />
      </Suspense>
    );
  }
  
  if (currentHash === '/auction-command') {
    return (
      <Suspense fallback={<PageLoader />}>
        <AuctionCommandPage />
      </Suspense>
    );
  }
  
  // Main app loads immediately (not lazy)
  return <App />;
};