import React from 'react';
import { X, TrendingUp, TrendingDown, Minus, Star, AlertCircle, Trophy, Target, DollarSign, Activity } from 'lucide-react';
import { Player } from '../types';

interface PlayerComparisonProps {
  players: Player[];
  onRemovePlayer: (playerId: string) => void;
  onClose: () => void;
}

export const PlayerComparison: React.FC<PlayerComparisonProps> = ({ players, onRemovePlayer, onClose }) => {
  if (players.length === 0) return null;

  const getPositionColor = (position: string) => {
    const colors: Record<string, string> = {
      QB: 'bg-red-100 text-red-800 border-red-300',
      RB: 'bg-blue-100 text-blue-800 border-blue-300',
      WR: 'bg-green-100 text-green-800 border-green-300',
      TE: 'bg-purple-100 text-purple-800 border-purple-300',
      K: 'bg-gray-100 text-gray-800 border-gray-300',
      DST: 'bg-orange-100 text-orange-800 border-orange-300',
    };
    return colors[position] || 'bg-gray-100 text-gray-800';
  };

  const getValueIndicator = (value: number, otherValues: number[], higherIsBetter: boolean = true) => {
    const max = Math.max(...otherValues);
    const min = Math.min(...otherValues);
    
    if (otherValues.length === 1) return <Minus className="w-4 h-4 text-gray-400" />;
    
    if (higherIsBetter) {
      if (value === max) return <TrendingUp className="w-4 h-4 text-green-500" />;
      if (value === min) return <TrendingDown className="w-4 h-4 text-red-500" />;
    } else {
      if (value === min) return <TrendingUp className="w-4 h-4 text-green-500" />;
      if (value === max) return <TrendingDown className="w-4 h-4 text-red-500" />;
    }
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  const getInjuryIcon = (status?: string) => {
    if (!status || status === 'Healthy') return null;
    const colors: Record<string, string> = {
      'Questionable': 'text-yellow-500',
      'Doubtful': 'text-orange-500',
      'Out': 'text-red-500',
      'IR': 'text-red-700',
    };
    return <AlertCircle className={`w-4 h-4 ${colors[status] || 'text-gray-500'}`} />;
  };

  const getCvsColor = (score: number) => {
    if (score >= 90) return 'text-green-600 font-bold';
    if (score >= 80) return 'text-green-500 font-semibold';
    if (score >= 70) return 'text-blue-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-gray-600';
  };

  const getRecommendation = (players: Player[]) => {
    if (players.length < 2) return null;
    
    const sortedByCvs = [...players].sort((a, b) => b.cvsScore - a.cvsScore);
    const bestPlayer = sortedByCvs[0];
    const cvsDiff = sortedByCvs[0].cvsScore - sortedByCvs[1].cvsScore;
    
    if (cvsDiff > 10) {
      return {
        player: bestPlayer,
        message: `Strong recommendation - ${cvsDiff} point CVS advantage`,
        strength: 'strong' as const
      };
    } else if (cvsDiff > 5) {
      return {
        player: bestPlayer,
        message: `Slight edge - ${cvsDiff} point CVS advantage`,
        strength: 'moderate' as const
      };
    } else {
      return {
        player: bestPlayer,
        message: 'Very close - consider other factors',
        strength: 'weak' as const
      };
    }
  };

  const recommendation = getRecommendation(players);

  const statRows = [
    { 
      label: 'CVS Score', 
      key: 'cvsScore' as keyof Player, 
      format: (val: any) => <span className={getCvsColor(val as number)}>{val}</span>,
      higherIsBetter: true,
      icon: <Trophy className="w-4 h-4 text-yellow-500" />
    },
    { 
      label: 'Projected Points', 
      key: 'projectedPoints' as keyof Player, 
      format: (val: any) => `${val} pts`,
      higherIsBetter: true,
      icon: <Target className="w-4 h-4 text-blue-500" />
    },
    { 
      label: 'ADP', 
      key: 'adp' as keyof Player, 
      format: (val: any) => val,
      higherIsBetter: false,
      icon: <Activity className="w-4 h-4 text-gray-500" />
    },
    { 
      label: 'Age', 
      key: 'age' as keyof Player, 
      format: (val: any) => `${val} years`,
      higherIsBetter: false,
      icon: null
    },
    { 
      label: 'Experience', 
      key: 'experience' as keyof Player, 
      format: (val: any) => `${val} years`,
      higherIsBetter: true,
      icon: null
    },
    { 
      label: 'Bye Week', 
      key: 'byeWeek' as keyof Player, 
      format: (val: any) => `Week ${val}`,
      higherIsBetter: false,
      icon: null
    },
    { 
      label: 'Est. Value', 
      key: 'cvsScore' as keyof Player, 
      format: (val: any) => `$${Math.round((val as number) * 0.5)}`,
      higherIsBetter: true,
      icon: <DollarSign className="w-4 h-4 text-green-500" />
    },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        <div className="bg-draft-primary text-white p-4 flex justify-between items-center">
          <h2 className="text-xl font-bold">Player Comparison</h2>
          <button
            onClick={onClose}
            className="hover:bg-white hover:bg-opacity-20 rounded-full p-1 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {recommendation && (
          <div className={`p-4 flex items-center space-x-3 ${
            recommendation.strength === 'strong' ? 'bg-green-50 border-b-2 border-green-200' :
            recommendation.strength === 'moderate' ? 'bg-blue-50 border-b-2 border-blue-200' :
            'bg-yellow-50 border-b-2 border-yellow-200'
          }`}>
            <Trophy className={`w-5 h-5 ${
              recommendation.strength === 'strong' ? 'text-green-600' :
              recommendation.strength === 'moderate' ? 'text-blue-600' :
              'text-yellow-600'
            }`} />
            <div>
              <span className="font-semibold">{recommendation.player.name}</span>
              <span className="text-gray-600 ml-2">{recommendation.message}</span>
            </div>
          </div>
        )}

        <div className="overflow-x-auto overflow-y-auto max-h-[calc(90vh-180px)]">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Attribute
                </th>
                {players.map(player => (
                  <th key={player.id} className="px-4 py-3 text-center min-w-[200px]">
                    <div className="space-y-2">
                      <div className="flex justify-center items-center space-x-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${getPositionColor(player.position)}`}>
                          {player.position}
                        </span>
                        {player.cvsScore >= 85 && <Star className="w-4 h-4 text-yellow-500 fill-current" />}
                        {getInjuryIcon(player.injuryStatus)}
                      </div>
                      <div className="font-bold text-gray-900">{player.name}</div>
                      <div className="text-sm text-gray-600">{player.team}</div>
                      <button
                        onClick={() => onRemovePlayer(player.id)}
                        className="text-xs text-red-600 hover:text-red-800 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {statRows.map((stat, index) => (
                <tr key={stat.key} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    <div className="flex items-center space-x-2">
                      {stat.icon}
                      <span>{stat.label}</span>
                    </div>
                  </td>
                  {players.map(player => {
                    const value = player[stat.key];
                    const allValues = players.map(p => p[stat.key] as number);
                    return (
                      <td key={player.id} className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <span className="text-sm font-semibold">
                            {stat.format(value)}
                          </span>
                          {getValueIndicator(value as number, allValues, stat.higherIsBetter)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              
              <tr className="bg-gray-100">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-gray-500" />
                    <span>Injury Status</span>
                  </div>
                </td>
                {players.map(player => (
                  <td key={player.id} className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      {getInjuryIcon(player.injuryStatus)}
                      <span className={`text-sm ${
                        !player.injuryStatus || player.injuryStatus === 'Healthy' 
                          ? 'text-green-600 font-semibold' 
                          : 'text-orange-600'
                      }`}>
                        {player.injuryStatus || 'Healthy'}
                      </span>
                    </div>
                  </td>
                ))}
              </tr>

              {players.some(p => p.news && p.news.length > 0) && (
                <tr>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 align-top">
                    Recent News
                  </td>
                  {players.map(player => (
                    <td key={player.id} className="px-4 py-3">
                      {player.news && player.news.length > 0 ? (
                        <div className="text-xs text-gray-600 space-y-1">
                          {player.news.slice(0, 2).map((item, i) => (
                            <div key={i} className="p-2 bg-gray-50 rounded">
                              <p className="font-semibold">{item.date instanceof Date ? item.date.toLocaleDateString() : item.date}</p>
                              <p>{item.headline || 'No details available'}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">No recent news</span>
                      )}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-gray-100 px-4 py-3 flex justify-between items-center">
          <span className="text-sm text-gray-600">
            Comparing {players.length} players
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Close Comparison
          </button>
        </div>
      </div>
    </div>
  );
};