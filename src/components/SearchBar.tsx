import React, { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import Fuse from 'fuse.js';
import { Player } from '../types';
import { validateSearchQuery } from '../utils/validation';

interface SearchBarProps {
  players: Player[];
  onSelectPlayer: (player: Player) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ players, onSelectPlayer }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Player[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const fuse = new Fuse(players, {
    keys: ['name', 'team', 'position'],
    threshold: 0.3,
    includeScore: true,
  });

  useEffect(() => {
    if (query.length > 1) {
      const searchResults = fuse.search(query).slice(0, 8);
      setResults(searchResults.map(r => r.item));
      setShowDropdown(true);
    } else {
      setResults([]);
      setShowDropdown(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (player: Player) => {
    onSelectPlayer(player);
    setQuery('');
    setShowDropdown(false);
  };

  const getPositionColor = (position: string) => {
    const colors: Record<string, string> = {
      QB: 'bg-red-100 text-red-800',
      RB: 'bg-blue-100 text-blue-800',
      WR: 'bg-green-100 text-green-800',
      TE: 'bg-purple-100 text-purple-800',
      K: 'bg-gray-100 text-gray-800',
      DST: 'bg-orange-100 text-orange-800',
    };
    return colors[position] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div ref={searchRef} className="relative w-full max-w-xl">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players by name, team, or position..."
          className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-draft-primary focus:border-transparent"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-xl max-h-96 overflow-y-auto">
          {results.map((player) => (
            <div
              key={player.id}
              onClick={() => handleSelect(player)}
              className="flex items-center justify-between p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
            >
              <div className="flex items-center space-x-3">
                <span className={`px-2 py-1 rounded text-xs font-semibold ${getPositionColor(player.position)}`}>
                  {player.position}
                </span>
                <div>
                  <p className="font-semibold text-gray-900">{player.name}</p>
                  <p className="text-sm text-gray-500">{player.team}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-draft-primary">
                  {player.auctionValue && player.auctionValue > 0 ? `$${player.auctionValue}` : 'N/A'}
                </p>
                <p className="text-xs text-gray-500">CVS: {player.cvsScore}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};