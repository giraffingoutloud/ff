# NFL Fantasy Football Auction Draft and Weekly Roster Optimization Tool - Project Documentation - 2025-2026 NFL SEASON - FOR ESPN FANTASY FOOTBALL 12 PERSON PPR AUCTION DRAFT LEAGUE

# PROJECT PURPOSE: The purpose of this tool is to assist the user in drafting the optimal fantasy team during an auction draft at the beginning of the season, and in rostering the optimal team each week during the season (currently only the former feature is implemented).

To this end, it is imperative that the tool use only real, verified data from canonical_data (C:\Users\giraf\Documents\projects\ff\canonical_data) and Sleeper API in order to maximize the accuracy of this tool's recommendations. Only use Sleeper API for updates on injury status and other news. For everything else such as names, historical statistics, projections, ADP, the only source of truth is data from canonical_data.

 ## CRITICAL: METHOD NAME VERIFICATION PROTOCOL

  ### BEFORE Writing ANY Code That Calls Methods:
  **MANDATORY VERIFICATION SEQUENCE:**

  1. **STOP** - Do not write code yet
  2. **SEARCH** - Use Grep to find the actual class definition
  3. **LIST** - Identify ALL available methods in that class
  4. **VERIFY** - Confirm the exact method signature
  5. **WRITE** - Only now write the code

  ### Common Hallucination Patterns to AVOID:
  - **WRONG**: `calculateMultipleValues()` → **CORRECT**: `calculateAllValues()`
  - **WRONG**: `predictMultiplePrices()` → **CORRECT**: `predictMultiple()`
  - **WRONG**: `calculateVORP()` → **DOES NOT EXIST**
  - **WRONG**: `calculateReplacementLevel()` → **CORRECT**: `getReplacementLevel()`

  ### Red Flags That Indicate Hallucination:
  - Method name "sounds right" but hasn't been verified
  - Assuming parallel method names (if `getX` exists, assuming `getAllX` exists)
  - Creating "logical" method names without checking
  - Writing code before running verification grep

  ### Verification Commands to Run FIRST:
  ```bash
  # Find class definition and methods
  grep -n "class ClassName" --include="*.ts" -r src/
  grep -n "^\s*(public|private|protected)?\s*\w+.*\(.*\).*\{" filename.ts

  # Find actual method usage examples
  grep -n "methodName" --include="*.ts" -r src/

  ENFORCEMENT RULE:

  If you write code calling a method WITHOUT FIRST showing grep output proving that method exists, you are hallucinating. The user should reject any code that doesn't include verification proof.

  Example of CORRECT Behavior:

  User: "Update the intrinsic value calculation"
  Assistant: "Let me first verify the available methods in IntrinsicValueEngine..."
  [Shows grep output proving calculateAllValues exists]
  "Now I can see the actual method is calculateAllValues(), not calculateMultipleValues()..."
  [Only THEN writes code]

  Example of WRONG Behavior:

  User: "Update the intrinsic value calculation"
  Assistant: "I'll update it using calculateMultipleValues()..."
  [Writes code without verification - THIS IS HALLUCINATION]

  REMEMBER: grep FIRST, code SECOND. ALWAYS.


VERIFICATION BEFORE ASSERTION

  - Never state something exists without tool verification first
  - File exists? → Use Read/Glob/Grep FIRST!
  - Function exists? → Search for it FIRST!
  - Data value? → Read the actual file FIRST!

  FORBIDDEN BEHAVIORS

  - Creating data to satisfy constraints ("it must exist so I'll make it")
  - Guessing file paths or names
  - Inventing values when data is missing
  - Assuming code structure without reading it
  - Completing partial patterns without seeing full context

  MANDATORY REALITY CHECKS

  Before EVERY factual statement:
  1. Have I personally verified this with a tool THIS session? If no → STOP and verify
  2. Am I filling gaps with assumptions? If yes → STOP and ask user
  3. Did the user say X exists but I can't find it? → Report "Cannot locate X" with proof of search

  MISSING DATA PROTOCOL

  When data/files are missing:
  - CORRECT: "I searched for [pattern] in [location] but found no results"
  - WRONG: "The file probably contains..." / "It should have..."

  CONTRADICTION RESOLUTION

  When user instructions conflict with reality:
  1. State the contradiction explicitly
  2. Show evidence (tool output) for both sides
  3. Ask: "You mentioned X, but I found Y. How should I proceed?"
  4. NEVER resolve contradictions by inventing data

  SEARCH EXHAUSTION RULE

  Before declaring something doesn't exist:
  1. Glob search with multiple patterns
  2. Grep search for content
  3. LS to check directories
  4. Only then report: "Exhaustive search found no matches"

 ## QUESTION VS ACTION PROTOCOL

  ### CRITICAL: Questions Are Not Commands
  **When user asks "Can we...?", "Is it possible to...?", "How would we...?", "What if we...?":**
  - These are QUESTIONS seeking information, NOT requests for action
  - Answer the question ONLY
  - DO NOT implement anything
  - DO NOT start coding
  - Wait for explicit action words

  ### Action Words That Mean "Do It":
  - "implement", "create", "build", "make"
  - "add", "write", "fix", "change"
  - "please do X", "go ahead and X"
  - "let's do X" (not "can we do X?")

  ### Question Words That Mean "Just Tell Me":
  - "is it possible...?"
  - "can we...?"
  - "how would...?"
  - "what if...?"
  - "should we...?"
  - "what about...?"

  ### CORRECT RESPONSE PATTERN:
  User: "Is it possible to add dark mode?"
  Assistant: "Yes, it's possible. We would need to [brief explanation]. Would you like me to implement it?"

  User: "Can we refactor this function?"
  Assistant: "Yes, we can refactor it to [brief explanation]. Should I proceed?"

  ### INCORRECT RESPONSE PATTERN:
  User: "Is it possible to add dark mode?"
  Assistant: "Yes, let me implement that for you..." [starts coding]

  ### TWO-STEP RULE:
  1. ANSWER the question first
  2. ASK if they want implementation (IMPORTANT!)
  3. Only proceed if they confirm (IMPORTANT!)

  ### Exception:
  Only if user says "...and do it" or "...and implement it" in the same message

# NO HALLUCINATIONS ALLOWED! 
  1. If data is missing, do not make anything up; inform the user of what is missing and await further instructions
  2. If there is a contradiction in the user's instructions, do not make any assumptions; inform the user and await further instructions
  3. If clarification is needed about anything, do not make any assumptions; seek the user's input
  4. If there is a better way to do something, inform the user so that a plan can be formulated
  5. Do not implement anything without the user's input

## IMPORTANT: Correct Project Directory
**Always verify you are in the correct project directory**
- **Correct Path**: `/mnt/c/Users/giraf/Documents/projects/ff/`

### When Making Changes
1. Always verify which component is actually being used (check main.tsx)
2. Test that changes appear in browser before confirming with user
3. Handle null/undefined values in display logic
4. Use descriptive labels instead of abbreviations

## CRITICAL: Comment Policy for AI Assistants, Large Language Models

**DO NOT ADD COMMENTS TO THE CODE UNLESS TOLD TO DO SO**

This codebase intentionally minimizes comments to avoid outdated documentation issues.

### Why No Comments?
- Comments often become outdated when code changes
- TypeScript types provide documentation
- Function/variable names are self-documenting
- Outdated comments confuse AI assistants

### Exceptions (Only if absolutely necessary):
- Complex mathematical formulas that aren't obvious
- External API quirks or workarounds
- Legal/compliance requirements
- If the user explicitly asks you to make a comment

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