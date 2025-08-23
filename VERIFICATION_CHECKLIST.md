# Code Verification Checklist - PREVENT HALLUCINATIONS

## Before Writing Any Code That Calls Methods:

### 1. VERIFY METHOD EXISTS
```bash
# Use Grep to find the exact method signature
grep -n "methodName" path/to/file.ts
```

### 2. VERIFY PARAMETERS
```bash
# Check what parameters the method expects
grep -A5 "methodName(" path/to/file.ts
```

### 3. VERIFY RETURN TYPE
```bash
# Check what the method returns
grep -B2 -A10 "methodName(" path/to/file.ts
```

### 4. VERIFY INTERFACES
```bash
# Check interface definitions
grep -A20 "interface InterfaceName" path/to/file.ts
```

## Common Mistakes That Led to Hallucinations:

1. **Assumed Method Names**
   - ❌ WRONG: `calculateMultipleValues` (hallucinated)
   - ✅ RIGHT: `calculateAllValues` (actual)

2. **Assumed Method Names Based on Pattern**
   - ❌ WRONG: `predictMultiplePrices` (hallucinated)
   - ✅ RIGHT: `predictMultiple` (actual)

3. **Incomplete Interface Implementation**
   - ❌ WRONG: Partial MarketContext with only some fields
   - ✅ RIGHT: Complete MarketContext with all required fields:
     ```typescript
     {
       draftedPlayers: DraftedPlayer[];
       remainingBudget: Map<string, number>;
       totalRemainingBudget: number;
       remainingPlayers: Player[];
       inflationRate: number;
       recentPrices: { position: Position; price: number }[];
     }
     ```

## Verification Commands to Run:

### Before Creating Service Calls:
```bash
# 1. Find all public methods in a service
grep -n "^\s*public\|^\s*[a-z].*(" src/services/path/to/service.ts

# 2. Check TypeScript compilation
npx tsc --noEmit

# 3. Find interface definitions
grep "export interface\|interface.*{" src/services/**/*.ts
```

### After Writing Code:
```bash
# 1. TypeScript check
npm run typecheck

# 2. Build check
npm run build

# 3. Runtime check - start server and check console
npm run dev
```

## Red Flags That Indicate Hallucination:

1. **Can't find the method in the file** - You're making it up
2. **TypeScript error about missing method** - Method doesn't exist
3. **Runtime TypeError about undefined function** - Method name is wrong
4. **Missing required properties** - Interface is incomplete

## The Golden Rule:

**NEVER WRITE CODE THAT CALLS A METHOD WITHOUT FIRST VERIFYING IT EXISTS**

Use this process:
1. Grep/Read to find the method
2. Copy the exact signature
3. Use the exact same name and parameters
4. Test immediately

## Example of Proper Verification:

```bash
# Step 1: Find the service class
grep "export class.*Service" src/services/**/*.ts

# Step 2: Find methods in that service
grep -n "^\s*[a-z].*(" src/services/valuation/intrinsicValueEngine.ts

# Step 3: Get exact signature
grep -B2 -A5 "calculateAllValues" src/services/valuation/intrinsicValueEngine.ts

# Step 4: Use EXACTLY what you found
# Found: calculateAllValues(players: Player[]): IntrinsicValue[]
# Use:   this.intrinsicValueEngine.calculateAllValues(availablePlayers)
```

## Remember:

- **READ the code, don't ASSUME the code**
- **COPY method names, don't TYPE method names**
- **VERIFY interfaces, don't GUESS interfaces**
- **CHECK TypeScript, don't IGNORE TypeScript**

This checklist should be followed EVERY TIME before writing code that interacts with existing services.