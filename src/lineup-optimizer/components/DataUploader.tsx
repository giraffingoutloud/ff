import React, { useState, useCallback, useRef } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, FileUp } from 'lucide-react';
import { PlayerProjection } from '../types';
import { TextFileParser } from '../services/TextFileParser';

interface DataUploaderProps {
  week: number;
  onDataLoaded: (projections: PlayerProjection[]) => void;
}

const parser = new TextFileParser();

// Move processing logic outside component
const processDataHelper = (projectionsFile: string, gamesFile: string, injuriesFile: string) => {
  console.log('processDataHelper called');
  const projections = parser.parseAndMergeData(
    projectionsFile,
    gamesFile,
    injuriesFile
  );
  console.log('processDataHelper parsed:', projections.length, 'projections');
  return projections;
};

export const DataUploader: React.FC<DataUploaderProps> = ({ week, onDataLoaded }) => {
  const [projectionsFile, setProjectionsFile] = useState<string>('');
  const [gamesFile, setGamesFile] = useState<string>('');
  const [injuriesFile, setInjuriesFile] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCSVImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        // Detect the type of CSV based on headers
        const firstLine = content.split('\n')[0].toLowerCase();
        
        if (firstLine.includes('projected') || firstLine.includes('points')) {
          setProjectionsFile(content);
          setSuccess(true);
          setError('');
          setTimeout(() => setSuccess(false), 3000);
        } else if (firstLine.includes('home') && firstLine.includes('away')) {
          setGamesFile(content);
          setSuccess(true);
          setError('');
          setTimeout(() => setSuccess(false), 3000);
        } else if (firstLine.includes('status') || firstLine.includes('injury')) {
          setInjuriesFile(content);
          setSuccess(true);
          setError('');
          setTimeout(() => setSuccess(false), 3000);
        } else {
          setError('Could not determine CSV type. Please ensure headers are included.');
        }
      }
    };
    reader.readAsText(file);
    
    // Reset the input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLTextAreaElement>, type: 'projections' | 'games' | 'injuries') => {
    const content = event.target.value;
    
    switch (type) {
      case 'projections':
        setProjectionsFile(content);
        break;
      case 'games':
        setGamesFile(content);
        break;
      case 'injuries':
        setInjuriesFile(content);
        break;
    }
    
    setError('');
    setSuccess(false);
  };

  const processData = () => {
    console.log('Processing data...');
    if (!projectionsFile.trim()) {
      console.log('No projections file provided');
      setError('Please provide projections data');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      console.log('Calling processDataHelper...');
      const projections = processDataHelper(projectionsFile, gamesFile, injuriesFile);
      
      console.log('Got projections from helper:', projections);
      
      if (!projections || projections.length === 0) {
        throw new Error('No valid projections found in the data');
      }

      console.log('About to call onDataLoaded with', projections.length, 'projections');
      console.log('onDataLoaded is:', onDataLoaded);
      
      // Call the callback
      onDataLoaded(projections);
      
      console.log('onDataLoaded called!');
      setSuccess(true);
      console.log('Success state set to true');
      
      // Clear forms after successful load
      setTimeout(() => {
        setProjectionsFile('');
        setGamesFile('');
        setInjuriesFile('');
        setSuccess(false);
      }, 2000);
    } catch (err) {
      console.error('Error in processData:', err);
      setError(err instanceof Error ? err.message : 'Failed to process data');
    } finally {
      setIsLoading(false);
    }
  };

  const sampleProjections = `Player Name,Team,Position,Projected Points,Floor,Ceiling
Josh Allen,BUF,QB,24.5,18.2,31.8
Patrick Mahomes,KC,QB,23.8,17.5,30.2
Christian McCaffrey,SF,RB,22.3,16.5,28.9
Austin Ekeler,LAC,RB,18.7,13.2,24.5
Breece Hall,NYJ,RB,17.2,12.1,22.8
Tyreek Hill,MIA,WR,19.2,13.8,25.1
Justin Jefferson,MIN,WR,18.5,13.1,24.2
CeeDee Lamb,DAL,WR,17.8,12.5,23.4
A.J. Brown,PHI,WR,16.9,11.8,22.1
Travis Kelce,KC,TE,16.2,11.3,21.5
Mark Andrews,BAL,TE,14.3,9.8,19.2
Justin Tucker,BAL,K,9.5,7.2,12.1
Harrison Butker,KC,K,9.2,6.8,11.8
San Francisco,SF,DST,11.2,7.5,15.3
Buffalo,BUF,DST,10.8,7.1,14.9`;

  const sampleGames = `Home Team,Away Team,Date,Time,Spread,Total
BUF,MIA,2024-09-08,13:00,-3.5,48.5
KC,DET,2024-09-07,20:20,-4.5,53.0
SF,DAL,2024-09-08,16:25,-4.0,45.0
LAC,LV,2024-09-08,16:05,-3.0,46.0
MIN,GB,2024-09-08,13:00,1.5,43.5
NYJ,NE,2024-09-08,13:00,-2.5,41.0
PHI,WAS,2024-09-08,13:00,-7.0,44.5
BAL,HOU,2024-09-08,13:00,-9.5,42.0`;

  const sampleInjuries = `Player Name,Team,Status,Practice Notes
Mike Evans,TB,Q,Limited practice Friday
Chris Olave,NO,D,DNP all week
George Kittle,SF,H,Full participant`;

  return (
    <div className="space-y-6 p-6 bg-gray-800 rounded-lg">
      <div className="border-b border-gray-700 pb-4">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Load Week {week} Data
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              Paste your data in the text areas below or import from CSV files
            </p>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleCSVImport}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
            >
              <FileUp className="w-4 h-4" />
              Import CSV
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
          <div className="text-sm text-red-300">{error}</div>
        </div>
      )}

      {success && (
        <div className="bg-green-900/20 border border-green-500 rounded-lg p-3 flex items-start gap-2">
          <CheckCircle className="w-5 h-5 text-green-400 mt-0.5" />
          <div className="text-sm text-green-300">Data loaded successfully!</div>
        </div>
      )}

      <div className="space-y-6">
        {/* Projections Input */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Projections (Required)
              </label>
              <div className="group relative">
                <div className="text-gray-400 hover:text-gray-300 cursor-help">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="absolute z-10 invisible group-hover:visible bg-gray-900 text-gray-300 text-xs rounded-lg p-3 w-64 left-0 top-6 border border-gray-700">
                  <p className="font-semibold mb-1">Format:</p>
                  <p className="mb-2">Player Name,Team,Position,Projected Points,Floor,Ceiling</p>
                  <p className="font-semibold mb-1">Example:</p>
                  <p className="font-mono text-xs">Josh Allen,BUF,QB,24.5,18.2,31.8</p>
                  <p className="mt-2 text-gray-400">Floor/Ceiling are optional (will be calculated if not provided)</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setProjectionsFile(sampleProjections)}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Use Sample
            </button>
          </div>
          <textarea
            value={projectionsFile}
            onChange={(e) => handleFileUpload(e, 'projections')}
            placeholder="Player Name,Team,Position,Projected Points,Floor,Ceiling&#10;Josh Allen,BUF,QB,24.5,18.2,31.8&#10;..."
            className="w-full h-32 p-3 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-300 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Games Input */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Games (Optional)
              </label>
              <div className="group relative">
                <div className="text-gray-400 hover:text-gray-300 cursor-help">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="absolute z-10 invisible group-hover:visible bg-gray-900 text-gray-300 text-xs rounded-lg p-3 w-64 left-0 top-6 border border-gray-700">
                  <p className="font-semibold mb-1">Format:</p>
                  <p className="mb-2">Home Team,Away Team,Date,Time,Spread,Total</p>
                  <p className="font-semibold mb-1">Example:</p>
                  <p className="font-mono text-xs">BUF,MIA,2024-09-08,13:00,-3.5,48.5</p>
                  <p className="mt-2 text-gray-400">Helps optimize based on game context and Vegas lines</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setGamesFile(sampleGames)}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Use Sample
            </button>
          </div>
          <textarea
            value={gamesFile}
            onChange={(e) => handleFileUpload(e, 'games')}
            placeholder="Home Team,Away Team,Date,Time,Spread,Total&#10;BUF,MIA,2024-09-08,13:00,-3.5,48.5&#10;..."
            className="w-full h-24 p-3 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-300 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Injuries Input */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Injuries (Optional)
              </label>
              <div className="group relative">
                <div className="text-gray-400 hover:text-gray-300 cursor-help">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="absolute z-10 invisible group-hover:visible bg-gray-900 text-gray-300 text-xs rounded-lg p-3 w-64 left-0 top-6 border border-gray-700">
                  <p className="font-semibold mb-1">Format:</p>
                  <p className="mb-2">Player Name,Team,Status,Practice Notes</p>
                  <p className="font-semibold mb-1">Example:</p>
                  <p className="font-mono text-xs">Mike Evans,TB,Q,Limited practice Friday</p>
                  <p className="mt-2 text-gray-400">Status codes: H=Healthy, Q=Questionable, D=Doubtful, O=Out, IR=Injured Reserve</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setInjuriesFile(sampleInjuries)}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Use Sample
            </button>
          </div>
          <textarea
            value={injuriesFile}
            onChange={(e) => handleFileUpload(e, 'injuries')}
            placeholder="Player Name,Team,Status,Practice Notes&#10;Mike Evans,TB,Q,Limited practice Friday&#10;..."
            className="w-full h-24 p-3 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-300 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-gray-700">
        <div className="text-xs text-gray-400">
          <div>Status codes: H=Healthy, Q=Questionable, D=Doubtful, O=Out</div>
          <div>Floor/Ceiling are optional (will be calculated if not provided)</div>
        </div>
        
        <button
          onClick={() => {
            console.log('Button clicked!');
            console.log('Has projections:', !!projectionsFile.trim());
            processData();
          }}
          disabled={isLoading || !projectionsFile.trim()}
          className={`px-6 py-2 rounded-lg font-medium transition-colors ${
            isLoading || !projectionsFile.trim()
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {isLoading ? 'Processing...' : 'Load Data'}
        </button>
      </div>
    </div>
  );
};