import React from 'react';

export const LineupOptimizerPageSimple: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-4xl font-bold mb-4">Lineup Optimizer</h1>
      <p className="text-xl">This is a simple test page to verify routing works.</p>
      <a href="#/" className="text-blue-400 hover:text-blue-300 mt-4 inline-block">
        ← Back to Main App
      </a>
    </div>
  );
};