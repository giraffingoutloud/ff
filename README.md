# NFL Fantasy Football Auction Draft and Weekly Roster Optimization Tool - Project Documentation - 2025-2026 NFL SEASON - FOR ESPN FANTASY FOOTBALL 12 PERSON PPR AUCTION DRAFT LEAGUE

## CRITICAL: For AI Assistants, Large Language Models:

# PROJECT PURPOSE: This is a comprehensive, data-driven fantasy football draft assistant and roster optimizer. The purpose of this tool is to assist the user in drafting the optimal fantasy team during an auction draft at the beginning of the season, and in rostering the optimal team each week during the season (currently only the former feature is implemented). To this end, it is imperative that the tool use only real, verified data from canonical_data (C:\Users\giraf\Documents\projects\ff\canonical_data) and Sleeper API, rather than estimations or guesses, in order to maximize the accuracy of this tool's recommendations. Only use Sleeper API for updates on injury status and other news. For everything else such as names, historical statistics, projections, ADP, the only source of truth is data from canonical_data.

# NO HALLUCINATIONS ALLOWED! No fake, fabricated, synthetic, or simulated data allowed! Use of such data will decrease this tool's accuracy. If data is missing, do not make anything up. Inform the user of the missing data and await further instructions. If there is a contradiction in the user's instructions, do not make any assumptions about what to do. Inform the user of the contradiction and await further instructions. If clarification is needed about anything, do not make any assumptions. Seek the user's input. If there is a better way to do something, inform the user so that a plan can be formulated. Do not implement anything without the user's input.

Built with React, TypeScript, and powered by authentic data from canonical_data and Sleeper API.

## Key Features

- **Smart Recommendations Engine**: Draft suggestions based on team needs, value, and position scarcity
- **PPR Specialization**: Advanced analysis for Points Per Reception leagues
- **Multi-Team Tracking**: Monitor all teams' rosters, budgets, and strategies in real-time

### Smart Recommendations System
The app provides intelligent recommendations across multiple categories:
- **Primary Pick**: Highest-value player based on your team's immediate needs
- **Alternative Options**: List of other strong candidates to consider
- **Value Picks**: Players with ADP > 40 and high CVS relative to their draft position
- **Budget Bargains**: Players valued at $5 or less with 50+ projected points
- **PPR Targets**: Players with highest projected reception counts

### Visual Player Badges
Quickly identify player characteristics with color-coded badges:
- **Elite (★)**: Top 24 ADP - First two rounds
- **Sleeper (💎)**: ADP 100-200 with 120+ projected points
- **Bust Risk (⚠)**: High ADP with low projected points for position
- **Value (💰)**: Late ADP with high projected points
- **PPR Stud**: 75+ projected receptions
- **Rookie (R)**: First-year NFL players
- **Young Talent (Y)**: Age ≤ 24 with 80+ projected points
- **Veteran (V)**: Age ≥ 31 experienced players
- **Overvalued (📉)**: High price but CVS doesn't justify it
- **Injury Status**: Q/D/O/IR/PUP/SUS badges with detailed tooltips

## Data Architecture

**ALL DATA IS 100% AUTHENTIC** - This application uses ZERO synthetic, mock, or fabricated data and includes automatic verification.

The project should be using all data in canonical_data/. 

### Data Sources
Every piece of information comes from verified sources:

#### Canonical Data Files Structure
```
canonical_data/
├── adp/
│   └── *_2025.csv                # 2025-2026 ADP rankings
│   └── *_2025.txt                # 2025-2026 ADP rankings
├── projections/
│   └── *_projections_2025.csv    # 2025-2026 season projections
├── historical_stats/
│   ├── fantasy-stats-*_2024.csv  # 2024 actual performance
│   └── fantasy-stats-*_2023.csv  # 2023 actual performance
└── strength_of_schedule/
    └── sos_2025.csv              # 2025-2026 schedule difficulty analysis
└── rankings/
    └── *_2025.csv                # 2025-2026 rankings (more will be added throughout season)
```

## Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd ff
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser to `http://localhost:5173` (or the port shown in terminal)

### Building for Production

```bash
npm run build
```

## 🔧 Configuration

### League Settings
Edit the initialization in `App.tsx`:
```javascript
initializeDraft({
  leagueSize: 12,      // Number of teams
  budget: 200,         // Auction budget
  rosterSize: 16,      // Players per team
  scoringType: 'PPR',  // PPR, HalfPPR, or Standard
  flexPositions: ['RB', 'WR', 'TE']
});
```

## License

This project is for personal, non-commercial use only.

--