import React, { memo } from 'react';
import { ModernExtendedPlayer } from '../types';

interface PlayerRowProps {
  player: ModernExtendedPlayer;
  evaluation: any;
  onDraft: (player: ModernExtendedPlayer) => void;
  children: React.ReactNode;
}

export const MemoizedPlayerRow = memo<PlayerRowProps>(({ 
  player, 
  evaluation, 
  onDraft,
  children 
}) => {
  return <>{children}</>;
}, (prevProps, nextProps) => {
  // Only re-render if these specific things change
  return (
    prevProps.player.id === nextProps.player.id &&
    prevProps.player.isDrafted === nextProps.player.isDrafted &&
    prevProps.evaluation?.edge === nextProps.evaluation?.edge &&
    prevProps.evaluation?.intrinsicValue === nextProps.evaluation?.intrinsicValue
  );
});

MemoizedPlayerRow.displayName = 'MemoizedPlayerRow';