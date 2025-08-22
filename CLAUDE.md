# NFL Fantasy Football Auction Draft and Weekly Roster Optimization Tool - Project Documentation - 2025-2026 NFL SEASON - FOR ESPN FANTASY FOOTBALL 12 PERSON PPR AUCTION DRAFT LEAGUE

## CRITICAL: For AI Assistants, Large Language Models:

# PROJECT PURPOSE: The purpose of this tool is to assist the user in drafting the optimal fantasy team during an auction draft at the beginning of the season, and in rostering the optimal team each week during the season (currently only the former feature is implemented). To this end, it is imperative that the tool use only real, verified data from canonical_data (C:\Users\giraf\Documents\projects\ff\canonical_data) and Sleeper API, rather than estimations or guesses, in order to maximize the accuracy of this tool's recommendations. Only use Sleeper API for updates on injury status and other news. For everything else such as names, historical statistics, projections, ADP, the only source of truth is data from canonical_data.

# NO HALLUCINATIONS ALLOWED! No fake, fabricated, synthetic, or simulated data allowed! Use of such data will decrease this tool's accuracy. If data is missing, do not make anything up. Inform the user of the missing data and await further instructions. If there is a contradiction in the user's instructions, do not make any assumptions about what to do. Inform the user of the contradiction and await further instructions. If clarification is needed about anything, do not make any assumptions. Seek the user's input. If there is a better way to do something, inform the user so that a plan can be formulated. Do not implement anything without the user's input. 

## IMPORTANT: Correct Project Directory
**Always verify you are in the correct project directory**
- **Correct Path**: `/mnt/c/Users/giraf/Documents/projects/ff/`

## Active Files

### Main Application
- **Entry Point**: `src/main.tsx` → loads `App.tsx` 
- **Main Component**: `src/App.tsx` 
- **Recommendations**: `src/components/Recommendations.tsx` 

### Running the Application
```bash
npm run dev  # Runs on port 5173 by default
```

### When Making Changes
1. Always verify which component is actually being used (check main.tsx)
2. Test that changes appear in browser before confirming with user
3. Handle null/undefined values in display logic
4. Use descriptive labels instead of abbreviations

## Key Components
- **App.tsx**: Main application with auction/list/grid views
- **Recommendations.tsx**: Smart recommendations with tabs
- **ValueFinder.tsx**: Find undervalued players based on CVS vs $ analysis
- **TeamCommand.tsx**: Team management view
- **PlayerCard.tsx**: Player detail card component

## Build Commands
```bash
npm run typecheck  # Check for TypeScript errors
npm run build      # Production build
npm run dev        # Development server
```

## Drafting Issues & Solutions
### Team Budget Not Updating Fix (2025-08-21)
- **Issue**: When drafting players to teams other than "My Team", the Team Budgets panel doesn't update
- **Solution**: Use the store's `draftPlayer` action instead of manually updating state with `setState`
- **File**: `src/App.tsx` - confirmDraft function should call `await draftPlayer()`

Last Updated: 2025-08-22

## CRITICAL: Comment Policy for AI Assistants, Large Language Models

**DO NOT ADD COMMENTS TO THE CODE**

This codebase intentionally has NO comments to avoid outdated documentation issues.

### Why No Comments?
- Comments often become outdated when code changes
- TypeScript types provide documentation
- Function/variable names are self-documenting
- Outdated comments confuse AI assistants

### Exceptions (Only if absolutely necessary):
- Complex mathematical formulas that aren't obvious
- External API quirks or workarounds
- Legal/compliance requirements

### Instead of Comments:
- Use descriptive variable/function names
- Rely on TypeScript types for documentation
- Keep functions small and single-purpose
- Use meaningful file and folder names

## Data Source Hierarchy Policy

### CRITICAL: Canonical Data is ABSOLUTE Truth
**NEVER overwrite ANY data from canonical CSV files in canonical_data**

### Data Loading Rules:
1. **Load canonical_data FIRST** - This is the foundation
2. **Sleeper API adds ONLY missing data** - Never replaces existing values

### What Canonical Data Provides (NEVER OVERRIDE):
- Player names (exact spelling)
- Team assignments
- Positions
- All projections (points, yards, TDs, receptions, etc.)
- ADP (Average Draft Position)
- Auction values
- Strength of Schedule
- Bye weeks

### What Sleeper API Can ADD (only if not in canonical):
- Injury status (Q, D, O, IR, PUP, SUS) - because it changes daily
- Active/inactive status - because it changes
- Player news - because it's real-time
- Trending data - because it's dynamic

### Implementation Rule:
```
if (canonicalData[field] exists) {
  USE canonicalData[field]  // ALWAYS
} else {
  USE sleeperData[field]     // ONLY as fallback
}
```

### Data Matching & Consistency Rules:

#### CRITICAL: Canonical Format is THE Format
**Whatever format canonical_data uses IS the correct format for this app**

#### Matching Process:
1. **Keep canonical format unchanged** - If CSV says "John Doe III", that's the name
2. **Match despite differences** - Still match "John Doe 3rd" from Sleeper to "John Doe III"
3. **Apply updates to canonical player** - Add injury status but keep name as "John Doe III"
4. **Never change canonical format**

#### Examples of Variations to Match:
```javascript
// These should all match to the same player:
Canonical: "A.J. Brown" ↔ Sleeper: "AJ Brown"
Canonical: "John Doe III" ↔ Sleeper: "John Doe 3rd"  
Canonical: "SF" ↔ Sleeper: "49ers" or "San Francisco"
Canonical: "D'Andre Swift" ↔ Sleeper: "Dandre Swift"

// Rule: Match them, but ALWAYS use canonical's version
```

#### Matching Strategy:
- Use NameNormalizer for fuzzy matching
- Try multiple variations to find matches
- Log mismatches for debugging
- If no match: Skip Sleeper data for that player

#### How NameNormalizer Works:
```javascript
// Canonical: "A.J. Brown" | Sleeper: "AJ Brown"
1. Generate variations of "A.J. Brown":
   - "A.J. Brown" (original)
   - "AJ Brown" (periods removed)
   - "aj brown" (lowercase)
   
2. Sleeper's "AJ Brown" matches variation #2
3. Apply Sleeper data to canonical "A.J. Brown"
4. Display as "A.J. Brown" everywhere

// This already works! Don't change it.
```

### Handling Inconsistencies WITHIN Canonical Data in canonical_data

#### If Canonical Data Itself Is Inconsistent:
**Use the FIRST occurrence as the standard**

#### Priority Order for Canonical Files:
1. `projections/*.csv` - Primary source
2. `adp/main_adp_2025.csv` - Secondary source  
3. `rankings/*.csv` - Tertiary source
4. Other files - Last resort

#### Example Resolution:
```javascript
// If projections has "A.J. Brown" but ADP has "AJ Brown":
// USE "A.J. Brown" because projections is higher priority

// Implementation:
1. Load projections FIRST - establish name format
2. When loading ADP, map "AJ Brown" → "A.J. Brown"
3. Store as "A.J. Brown" everywhere
```

#### Deduplication Strategy:
- Load files in priority order
- First occurrence of a player sets their canonical name
- All subsequent occurrences map to that first name
- Use NameNormalizer to detect duplicates

#### Warning Signs of Inconsistency:
- Same player appears twice in player list
- Stats don't match between files for same player
- Team totals don't add up correctly

## Code Modification Rules

### File Management:
- NEVER create new files unless explicitly requested
- ALWAYS prefer editing existing files over creating new ones
- NEVER create documentation files (*.md) unless explicitly requested
- NEVER proactively create test files unless explicitly requested

### After Changes:
- Run `npm run typecheck` after TypeScript changes
- Run `npm run lint` after significant changes
- Test UI changes with `npm run dev` before confirming
- Check that the app still loads player data correctly

## Security & Git Policies

### Security Rules:
- NEVER commit API keys or secrets
- NEVER log sensitive user data
- Sanitize all user inputs
- Use HTTPS for all external API calls

### Git Commit Rules:
- NEVER commit unless user explicitly asks
- NEVER push to remote unless user explicitly asks
- NEVER modify git history (rebase, force push)
- ALWAYS show what will be committed before committing

## Project Structure Reference

### Active Components:
- Main app: `src/App.tsx`
- Data service: `src/services/canonicalService.ts`
- State management: `src/store/draftStore.ts`
- Recommendations: `src/components/Recommendations.tsx`

### Data Flow:
1. CSV files loaded from `canonical_data/`
2. Sleeper API enriches with real-time updates
3. Data stored in memory (no database)
4. UI components consume via hooks

## UI/UX Standards

### Design Rules:
- Dark mode is the ONLY mode (no light theme)
- Use Tailwind classes, not inline styles
- Follow position color scheme (position-qb, position-rb, etc.)
- Maintain mobile responsiveness

### User Communication:
- Be are thorough as possible in your communication with the user
- Show changes rather than explaining
- Ask for clarification if ambiguous
- Warn before breaking changes