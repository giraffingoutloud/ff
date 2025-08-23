# NFL Fantasy Football Auction Draft and Weekly Roster Optimization Tool - Project Documentation - 2025-2026 NFL SEASON - FOR ESPN FANTASY FOOTBALL 12 PERSON PPR AUCTION DRAFT LEAGUE

## CRITICAL: For AI Assistants, Large Language Models:

# PROJECT PURPOSE: This is a comprehensive, data-driven fantasy football draft assistant and roster optimizer. The purpose of this tool is to assist the user in drafting the optimal fantasy team during an auction draft at the beginning of the season, and in rostering the optimal team each week during the season (currently only the former feature is implemented). To this end, it is imperative that the tool use only real, verified data from canonical_data (C:\Users\giraf\Documents\projects\ff\canonical_data) and Sleeper API in order to maximize the accuracy of this tool's recommendations. Only use Sleeper API for updates on injury status and other news. For everything else such as names, historical statistics, projections, ADP, the only source of truth is data from canonical_data.

 NO HALLUCINATIONS ALLOWED! 
  1. If data is missing, do not make anything up; inform the user of what is missing and await further instructions
  2. If there is a contradiction in the user's instructions, do not make any assumptions; inform the user and await further instructions
  3. If clarification is needed about anything, do not make any assumptions; seek the user's input
  4. If there is a better way to do something, inform the user so that a plan can be formulated
  5. Do not implement anything without the user's input

Built with React, TypeScript, and powered by authentic data from canonical_data and Sleeper API.

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

--