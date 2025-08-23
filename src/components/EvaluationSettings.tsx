/**
 * Settings component to configure evaluation system
 * Allows toggling between old CVS and new Value/Price/Edge system
 */

import React, { useState, useEffect } from 'react';
import { featureFlags, updateFeatureFlags, resetFeatureFlags } from '../config/featureFlags';
import { LeagueSettings, defaultLeagueSettings, leaguePresets } from '../services/valuation/leagueSettings';

interface EvaluationSettingsProps {
  onSettingsChange?: (settings: LeagueSettings) => void;
  onClose?: () => void;
}

export const EvaluationSettings: React.FC<EvaluationSettingsProps> = ({
  onSettingsChange,
  onClose
}) => {
  const [localFlags, setLocalFlags] = useState(featureFlags);
  const [leagueSettings, setLeagueSettings] = useState<LeagueSettings>(defaultLeagueSettings);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Load saved settings
  useEffect(() => {
    const saved = localStorage.getItem('ff_league_settings');
    if (saved) {
      try {
        setLeagueSettings(JSON.parse(saved));
      } catch (error) {
        console.error('Failed to load league settings:', error);
      }
    }
  }, []);

  // Save settings
  const saveSettings = () => {
    updateFeatureFlags(localFlags);
    localStorage.setItem('ff_league_settings', JSON.stringify(leagueSettings));
    if (onSettingsChange) {
      onSettingsChange(leagueSettings);
    }
    if (onClose) {
      onClose();
    }
  };

  // Reset to defaults
  const resetSettings = () => {
    resetFeatureFlags();
    setLocalFlags(featureFlags);
    setLeagueSettings(defaultLeagueSettings);
    localStorage.removeItem('ff_league_settings');
  };

  // Apply preset
  const applyPreset = (preset: keyof typeof leaguePresets) => {
    setLeagueSettings(leaguePresets[preset]);
  };

  return (
    <div className="bg-gray-900 rounded-lg p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Evaluation Settings</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white"
        >
          ✕
        </button>
      </div>

      {/* Evaluation System Toggle */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4">Evaluation System</h3>
        
        <div className="space-y-4">
          <label className="flex items-center justify-between p-4 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-750">
            <div>
              <div className="font-medium">
                {localFlags.useNewEvaluationSystem ? 'New System (Value/Price/Edge)' : 'Legacy System (CVS)'}
              </div>
              <div className="text-sm text-gray-400 mt-1">
                {localFlags.useNewEvaluationSystem 
                  ? 'Separates intrinsic value from market price to find edge opportunities'
                  : 'Combined score using ADP, AAV, and projections'}
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={localFlags.useNewEvaluationSystem}
                onChange={(e) => setLocalFlags({ ...localFlags, useNewEvaluationSystem: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </label>

          {/* Sub-options for new system */}
          {localFlags.useNewEvaluationSystem && (
            <div className="ml-4 space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={localFlags.showIntrinsicValue}
                  onChange={(e) => setLocalFlags({ ...localFlags, showIntrinsicValue: e.target.checked })}
                  className="rounded bg-gray-700 border-gray-600"
                />
                <span className="text-sm">Show Intrinsic Value</span>
              </label>
              
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={localFlags.showMarketPrice}
                  onChange={(e) => setLocalFlags({ ...localFlags, showMarketPrice: e.target.checked })}
                  className="rounded bg-gray-700 border-gray-600"
                />
                <span className="text-sm">Show Market Price</span>
              </label>
              
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={localFlags.showEdgeCalculations}
                  onChange={(e) => setLocalFlags({ ...localFlags, showEdgeCalculations: e.target.checked })}
                  className="rounded bg-gray-700 border-gray-600"
                />
                <span className="text-sm">Show Edge Calculations</span>
              </label>
            </div>
          )}
        </div>
      </div>

      {/* League Settings */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4">League Configuration</h3>
        
        {/* Presets */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-400 mb-2">Quick Presets</label>
          <div className="flex gap-2">
            <button
              onClick={() => applyPreset('standard')}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            >
              Standard PPR
            </button>
            <button
              onClick={() => applyPreset('halfPPR')}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            >
              Half PPR
            </button>
            <button
              onClick={() => applyPreset('superFlex')}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            >
              SuperFlex
            </button>
            <button
              onClick={() => applyPreset('dynasty')}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            >
              Dynasty
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Number of Teams</label>
            <input
              type="number"
              min="6"
              max="20"
              value={leagueSettings.numTeams}
              onChange={(e) => setLeagueSettings({ ...leagueSettings, numTeams: parseInt(e.target.value) || 12 })}
              className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700 focus:border-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Auction Budget</label>
            <input
              type="number"
              min="100"
              max="1000"
              value={leagueSettings.budget}
              onChange={(e) => setLeagueSettings({ ...leagueSettings, budget: parseInt(e.target.value) || 200 })}
              className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700 focus:border-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Roster Size</label>
            <input
              type="number"
              min="10"
              max="30"
              value={leagueSettings.rosterSize}
              onChange={(e) => setLeagueSettings({ ...leagueSettings, rosterSize: parseInt(e.target.value) || 16 })}
              className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700 focus:border-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">PPR Scoring</label>
            <select
              value={leagueSettings.scoring.receptions}
              onChange={(e) => setLeagueSettings({
                ...leagueSettings,
                scoring: { ...leagueSettings.scoring, receptions: parseFloat(e.target.value) }
              })}
              className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700 focus:border-blue-500"
            >
              <option value="0">Standard (0 PPR)</option>
              <option value="0.5">Half PPR (0.5)</option>
              <option value="1">Full PPR (1.0)</option>
              <option value="1.5">TE Premium (1.5)</option>
            </select>
          </div>
        </div>
        
        {/* League Type Flags */}
        <div className="mt-4 flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={leagueSettings.isSuperFlex}
              onChange={(e) => setLeagueSettings({ ...leagueSettings, isSuperFlex: e.target.checked })}
              className="rounded bg-gray-700 border-gray-600"
            />
            <span className="text-sm">SuperFlex</span>
          </label>
          
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={leagueSettings.isDynasty}
              onChange={(e) => setLeagueSettings({ ...leagueSettings, isDynasty: e.target.checked })}
              className="rounded bg-gray-700 border-gray-600"
            />
            <span className="text-sm">Dynasty</span>
          </label>
          
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={leagueSettings.isTEPremium}
              onChange={(e) => setLeagueSettings({ ...leagueSettings, isTEPremium: e.target.checked })}
              className="rounded bg-gray-700 border-gray-600"
            />
            <span className="text-sm">TE Premium</span>
          </label>
        </div>
      </div>

      {/* Advanced Settings */}
      <div className="mb-8">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white"
        >
          <span>{showAdvanced ? '▼' : '▶'}</span>
          Advanced Settings
        </button>
        
        {showAdvanced && (
          <div className="mt-4 space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={localFlags.showDebugInfo}
                onChange={(e) => setLocalFlags({ ...localFlags, showDebugInfo: e.target.checked })}
                className="rounded bg-gray-700 border-gray-600"
              />
              <span className="text-sm">Show Debug Information</span>
            </label>
            
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={localFlags.enableLeagueCustomization}
                onChange={(e) => setLocalFlags({ ...localFlags, enableLeagueCustomization: e.target.checked })}
                className="rounded bg-gray-700 border-gray-600"
              />
              <span className="text-sm">Enable League Customization</span>
            </label>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between">
        <button
          onClick={resetSettings}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded"
        >
          Reset to Defaults
        </button>
        
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded"
          >
            Cancel
          </button>
          <button
            onClick={saveSettings}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded font-medium"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};