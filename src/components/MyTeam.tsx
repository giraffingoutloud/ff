import React from 'react';
import { User, DollarSign } from 'lucide-react';
import { Team, DraftedPlayer } from '../types';

interface MyTeamProps {
  team: Team;
}

interface RosterPosition {
  label: string;
  position: string;
  player?: DraftedPlayer;
  isRequired: boolean;
}

export const MyTeam: React.FC<MyTeamProps> = ({ team }) => {
  const remainingBudget = team.budget - team.spentBudget;
  const maxBid = remainingBudget - (16 - team.roster.length - 1); // Save $1 per remaining slot

  // Organize roster by position
  const qbs = team.roster.filter(p => p.position === 'QB');
  const rbs = team.roster.filter(p => p.position === 'RB');
  const wrs = team.roster.filter(p => p.position === 'WR');
  const tes = team.roster.filter(p => p.position === 'TE');
  const ks = team.roster.filter(p => p.position === 'K');
  const dsts = team.roster.filter(p => p.position === 'DST');

  // Build roster display with proper assignments
  const rosterPositions: RosterPosition[] = [
    { label: 'QB', position: 'QB', player: qbs[0], isRequired: true },
    { label: 'RB1', position: 'RB', player: rbs[0], isRequired: true },
    { label: 'RB2', position: 'RB', player: rbs[1], isRequired: true },
    { label: 'WR1', position: 'WR', player: wrs[0], isRequired: true },
    { label: 'WR2', position: 'WR', player: wrs[1], isRequired: true },
    { label: 'WR3', position: 'WR', player: wrs[2], isRequired: true },
    { label: 'TE', position: 'TE', player: tes[0], isRequired: true },
    { label: 'FLEX', position: 'FLEX', player: undefined, isRequired: true },
    { label: 'K', position: 'K', player: ks[0], isRequired: true },
    { label: 'DST', position: 'DST', player: dsts[0], isRequired: true },
  ];

  // Determine FLEX player (best available RB/WR/TE not in starting lineup)
  const flexCandidates = [
    ...rbs.slice(2), // RB3+
    ...wrs.slice(3), // WR4+
    ...tes.slice(1), // TE2+
  ];
  if (flexCandidates.length > 0) {
    rosterPositions[7].player = flexCandidates[0]; // FLEX position
  }

  // Collect all players assigned to starting positions
  const startingPlayers = new Set<string>();
  rosterPositions.forEach(pos => {
    if (pos.player) {
      startingPlayers.add(pos.player.id);
    }
  });

  // Add bench slots with remaining players
  const benchPlayers = team.roster.filter(p => !startingPlayers.has(p.id));
  for (let i = 0; i < 6; i++) {
    rosterPositions.push({
      label: 'BENCH',
      position: 'BENCH',
      player: benchPlayers[i],
      isRequired: false
    });
  }

  // Calculate position needs
  const needs: string[] = [];
  if (qbs.length === 0) needs.push('QB');
  if (rbs.length < 2) {
    for (let i = rbs.length; i < 2; i++) needs.push('RB');
  }
  if (wrs.length < 3) {
    for (let i = wrs.length; i < 3; i++) needs.push('WR');
  }
  if (tes.length === 0) needs.push('TE');
  if (ks.length === 0) needs.push('K');
  if (dsts.length === 0) needs.push('DST');

  return (
    <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-lg p-3 sm:p-6 border border-gray-200 dark:border-dark-border">
      <div className="flex items-center justify-between mb-3 sm:mb-6">
        <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-dark-text flex items-center">
          <User className="w-5 sm:w-6 h-5 sm:h-6 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">My Team</span>
          <span className="sm:hidden">Team</span>
        </h2>
        <div className="flex items-center space-x-2 sm:space-x-3">
          <span className="text-sm sm:text-base text-gray-500 dark:text-gray-400">Max:</span>
          <span className="font-bold text-base sm:text-lg text-draft-primary dark:text-blue-400">${maxBid}</span>
        </div>
      </div>

      <div className="mb-3 sm:mb-6 p-2 sm:p-4 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <div className="flex items-center">
            <DollarSign className="w-4 sm:w-5 h-4 sm:h-5 mr-1 sm:mr-2 text-gray-600" />
            <span className="text-sm sm:text-base text-gray-600 dark:text-gray-400">Budget:</span>
          </div>
          <div className="text-left sm:text-right">
            <span className="font-bold text-lg sm:text-xl dark:text-dark-text">${remainingBudget}</span>
            <span className="text-sm sm:text-base text-gray-500 dark:text-gray-400"> / ${team.budget}</span>
          </div>
        </div>
        <div className="mt-3 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
          <div
            className="bg-draft-primary rounded-full h-3 transition-all"
            style={{ width: `${Math.min(100, ((team.budget - remainingBudget) / team.budget) * 100)}%` }}
          />
        </div>
      </div>

      <div className="space-y-2 sm:space-y-3">
        {rosterPositions.map((pos, index) => (
          <div
            key={`${pos.label}-${index}`}
            className={`p-2 sm:p-3 rounded-lg border ${
              pos.player 
                ? 'bg-green-50 border-green-200' 
                : pos.isRequired 
                  ? 'bg-red-50 border-red-200' 
                  : 'bg-gray-50 border-gray-200'
            }`}
          >
            <div className="flex justify-between items-center gap-3">
              <span className="text-sm sm:text-base font-medium text-gray-700 dark:text-gray-300 flex-shrink-0 min-w-[40px] sm:min-w-[50px]">
                {pos.label}
              </span>
              {pos.player ? (
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-base sm:text-xl font-semibold dark:text-dark-text truncate">{pos.player.name}</span>
                  <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">${pos.player.purchasePrice}</span>
                </div>
              ) : (
                <span className="text-xs sm:text-sm text-gray-400 dark:text-gray-500 italic">Empty</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 sm:mt-6 pt-3 sm:pt-5 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <span className="text-sm sm:text-base text-gray-600 dark:text-gray-400">Roster:</span>
          <span className="font-semibold text-base sm:text-lg dark:text-dark-text">{team.roster.length} / 16</span>
        </div>
        {needs.length > 0 && (
          <div className="mt-3">
            <span className="text-base text-gray-600 dark:text-gray-400">Needs:</span>
            <div className="flex flex-wrap gap-2 mt-2">
              {needs.map((need, i) => (
                <span key={i} className="px-3 py-1.5 bg-draft-warning text-white text-sm rounded-full">
                  {need}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};