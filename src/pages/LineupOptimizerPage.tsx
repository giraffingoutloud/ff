import React, { useState, useCallback } from 'react';
import { LineupManager } from '../lineup-optimizer/components/LineupManager';
import { DataUploader } from '../lineup-optimizer/components/DataUploader';
import { PlayerProjection } from '../lineup-optimizer/types';

export const LineupOptimizerPage: React.FC = () => {
  const [projections, setProjections] = useState<PlayerProjection[]>([]);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [dataLoaded, setDataLoaded] = useState(false);

  const handleDataLoaded = useCallback((loadedProjections: PlayerProjection[]) => {
    console.log('LineupOptimizerPage: handleDataLoaded called with', loadedProjections.length, 'projections');
    setProjections(loadedProjections);
    setDataLoaded(true);
    console.log('LineupOptimizerPage: dataLoaded set to true');
  }, []);

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <a 
            href="#/"
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            ← Back to Draft Optimizer
          </a>
          
          <div className="flex items-center gap-4">
            <label className="text-sm text-gray-400">Week:</label>
            <select
              value={currentWeek}
              onChange={(e) => {
                setCurrentWeek(Number(e.target.value));
                setDataLoaded(false);
                setProjections([]);
              }}
              className="bg-gray-800 text-white px-3 py-1 rounded border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Array.from({ length: 18 }, (_, i) => i + 1).map(week => (
                <option key={week} value={week}>Week {week}</option>
              ))}
            </select>
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-white mb-8">
          Weekly Lineup Optimizer
        </h1>
        
        {console.log('LineupOptimizerPage render: dataLoaded =', dataLoaded, 'projections =', projections.length)}
        {!dataLoaded ? (
          <DataUploader week={currentWeek} onDataLoaded={handleDataLoaded} />
        ) : (
          <div>
            <div className="mb-4 flex justify-end">
              <button
                onClick={() => {
                  setDataLoaded(false);
                  setProjections([]);
                }}
                className="text-sm text-gray-400 hover:text-gray-300"
              >
                Load Different Data
              </button>
            </div>
            {console.log('About to render LineupManager with:', {
              players: projections.map(p => p.player),
              week: currentWeek,
              projectionsCount: projections.length
            })}
            <LineupManager 
              players={projections.map(p => p.player)} 
              week={currentWeek}
              projections={projections}
            />
          </div>
        )}
      </div>
    </div>
  );
};