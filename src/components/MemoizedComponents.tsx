import React, { memo } from 'react';
import { ValueFinder } from './ValueFinder';
import { PriorityNeeds } from './PriorityNeeds';
import Dashboard from './Dashboard/Dashboard';
import { DraftHistory } from './DraftHistory';

// Memoize expensive components to prevent unnecessary re-renders

export const MemoizedValueFinder = memo(ValueFinder);
MemoizedValueFinder.displayName = 'MemoizedValueFinder';

export const MemoizedPriorityNeeds = memo(PriorityNeeds);
MemoizedPriorityNeeds.displayName = 'MemoizedPriorityNeeds';

export const MemoizedDashboard = memo(Dashboard);
MemoizedDashboard.displayName = 'MemoizedDashboard';

export const MemoizedDraftHistory = memo(DraftHistory);
MemoizedDraftHistory.displayName = 'MemoizedDraftHistory';