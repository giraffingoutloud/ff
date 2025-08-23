import { lazy } from 'react';

// Lazy load heavy dashboard components
export const Dashboard = lazy(() => 
  import('./Dashboard/Dashboard').then(module => ({ 
    default: module.Dashboard 
  }))
);

export const PlayerDatabase = lazy(() => 
  import('./PlayerDatabase').then(module => ({ 
    default: module.default 
  }))
);

export const TeamCommandCenter = lazy(() => 
  import('./TeamCommandCenter').then(module => ({ 
    default: module.default 
  }))
);

export const ValueFinder = lazy(() => 
  import('./ValueFinder').then(module => ({ 
    default: module.default 
  }))
);

export const DraftHistory = lazy(() => 
  import('./DraftHistory').then(module => ({ 
    default: module.default 
  }))
);

// Component loader for consistent loading UI
export const ComponentLoader = () => (
  <div className="flex items-center justify-center p-8">
    <div className="animate-pulse flex space-x-2">
      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
    </div>
  </div>
);