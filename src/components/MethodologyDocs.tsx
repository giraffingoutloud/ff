import React, { useState } from 'react';
import { X, ChevronDown, ChevronRight, Calculator, Database, Code, TrendingUp, DollarSign, BarChart } from 'lucide-react';

interface MethodologyDocsProps {
  onClose: () => void;
}

export const MethodologyDocs: React.FC<MethodologyDocsProps> = ({ onClose }) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview']));

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const Section = ({ id, title, icon, children }: { id: string; title: string; icon: React.ReactNode; children: React.ReactNode }) => (
    <div className="mb-4">
      <button
        onClick={() => toggleSection(id)}
        className="w-full flex items-center gap-2 p-3 bg-dark-bg-secondary rounded-lg hover:bg-dark-bg-tertiary transition-colors"
      >
        {expandedSections.has(id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <span className="font-semibold text-dark-text">{title}</span>
      </button>
      {expandedSections.has(id) && (
        <div className="mt-2 p-4 bg-dark-bg rounded-lg border border-dark-border">
          {children}
        </div>
      )}
    </div>
  );

  const DataSource = ({ label, source, file }: { label: string; source: string; file?: string }) => (
    <div className="mb-2">
      <span className="text-draft-primary font-medium">{label}:</span>
      <span className="text-dark-text-secondary ml-2">{source}</span>
      {file && <div className="text-xs text-dark-text-tertiary ml-4">{file}</div>}
    </div>
  );

  const Formula = ({ children }: { children: React.ReactNode }) => (
    <div className="bg-dark-bg-secondary p-3 rounded-lg font-mono text-sm text-green-400 my-2">
      {children}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-bg-primary rounded-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-border">
          <h2 className="text-xl font-bold text-dark-text">Methodology</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-dark-bg-secondary rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <Section id="overview" title="Overview" icon={<Calculator className="w-5 h-5 text-blue-400" />}>
            <div className="space-y-4 text-dark-text-secondary">
              <p>
                This tool uses three main factors to help you make optimal auction draft decisions:
              </p>
              <ol className="list-decimal list-inside space-y-2 ml-4">
                <li><strong className="text-dark-text">Intrinsic Value</strong> - What a player is truly worth based on projected performance</li>
                <li><strong className="text-dark-text">Market Price</strong> - What the market expects to pay based on ADP/AAV</li>
                <li><strong className="text-dark-text">Edge</strong> - The opportunity when intrinsic value exceeds market price</li>
              </ol>
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mt-4">
                <p className="text-sm">
                  <strong className="text-blue-400">Objective:</strong> Find players where calculated intrinsic value exceeds the market's expected price.
                </p>
              </div>
            </div>
          </Section>

          <Section id="data-sources" title="Data Sources" icon={<Database className="w-5 h-5 text-green-400" />}>
            <div className="space-y-4 text-dark-text-secondary">
              <h4 className="font-semibold text-dark-text">All Data is Real - No Simulations</h4>
              
              <div className="space-y-3">
                <DataSource 
                  label="Projections" 
                  source="2025 NFL season projections from Pro Football Focus"
                  file="canonical_data/projections/offense_projections_2025.csv (QB/RB/WR/TE), k_projections_2025.csv, dst_projections_2025.csv"
                />
                
                <DataSource 
                  label="ESPN ADP" 
                  source="ESPN-specific Average Draft Position"
                  file="canonical_data/adp/adp1_2025.csv (column 7)"
                />
                
                <DataSource 
                  label="Auction Values (AAV)" 
                  source="Average auction values from fantasy experts"
                  file="canonical_data/adp/adp0_2025.csv"
                />
                
                <DataSource 
                  label="Injury Status" 
                  source="Real-time updates from Sleeper API (refreshed on page load)"
                  file="API call - not from CSV"
                />
                
                <DataSource 
                  label="Strength of Schedule" 
                  source="Weekly opponent difficulty ratings"
                  file="canonical_data/strength_of_schedule/sos_2025.csv"
                />
              </div>
              
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                <p className="text-sm">
                  <strong className="text-yellow-400">Important:</strong> All projections and ADP data come from CSV files updated before the 2025 season. Injury status is the only real-time data, updated from Sleeper API.
                </p>
              </div>
            </div>
          </Section>

          <Section id="intrinsic-value" title="Intrinsic Value ($Value)" icon={<TrendingUp className="w-5 h-5 text-purple-400" />}>
            <div className="space-y-4 text-dark-text-secondary">
              <h4 className="font-semibold text-dark-text">What is Intrinsic Value?</h4>
              <p>
                The true worth of a player based solely on their projected fantasy points, independent of market sentiment. This is what you should theoretically pay if the market was perfectly efficient.
              </p>

              <h4 className="font-semibold text-dark-text mt-4">Calculation Method: VORP (Value Over Replacement Player)</h4>
              
              <div className="space-y-3">
                <div>
                  <strong>Step 1: Calculate Replacement Level</strong>
                  <Formula>
                    Replacement Level = Points of the Nth best player at position<br/>
                    where N = (starters × teams) + (bench allocation × teams)
                  </Formula>
                  <p className="text-sm mt-2">For a 12-team league with 2 RB starters + ~30% of 7 bench spots for RBs ≈ 36th RB</p>
                </div>

                <div>
                  <strong>Step 2: Calculate VORP</strong>
                  <Formula>
                    VORP = Player's Projected Points - Replacement Level Points
                  </Formula>
                </div>

                <div>
                  <strong>Step 3: Apply Streaming Adjustments</strong>
                  <p className="text-sm">Replacement level is increased for streamable positions (reduces VORP):</p>
                  <ul className="list-disc list-inside ml-4 text-sm">
                    <li>QB: +12% (moderately streamable)</li>
                    <li>RB: +2% (not streamable)</li>
                    <li>WR: +5% (somewhat streamable)</li>
                    <li>TE: +8% (more streamable)</li>
                    <li>K: +25% (highly streamable)</li>
                    <li>DST: +30% (most streamable)</li>
                  </ul>
                  <p className="text-xs text-dark-text-tertiary mt-2">
                    Rationale: Streamable positions have higher replacement value because you can pick up comparable players from waivers
                  </p>
                </div>

                <div>
                  <strong>Step 4: Convert VORP to Dollars (Non-Linear Curves)</strong>
                  <Formula>
                    Dollar Value = base + (VORP/scale)^exponent × scale
                  </Formula>
                  <p className="text-sm mt-2">Position-specific exponents (hardcoded based on historical analysis):</p>
                  <ul className="list-disc list-inside ml-4 text-sm">
                    <li>RB: 1.25 (strong curve - elite RBs are league-winners)</li>
                    <li>TE: 1.3 (steepest curve - massive tier cliff)</li>
                    <li>WR: 1.15 (moderate curve)</li>
                    <li>QB: 1.1 (slight curve)</li>
                    <li>K/DST: 1.0-1.05 (nearly linear - fungible)</li>
                  </ul>
                </div>

                <div>
                  <strong>Step 5: Budget Normalization</strong>
                  <p className="text-sm">All values are normalized so total equals league budget ($2,400 for 12 teams × $200)</p>
                </div>
              </div>
              
              <h4 className="font-semibold text-dark-text mt-6">Dynamic Updates During Draft</h4>
              <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 mt-2">
                <p className="text-sm text-dark-text-secondary mb-2">
                  Intrinsic values recalculate after each pick:
                </p>
                <ul className="list-disc list-inside ml-4 text-sm space-y-1">
                  <li><strong className="text-purple-400">Replacement Level Updates:</strong> As players get drafted, the Nth best remaining player changes, affecting VORP for all players</li>
                  <li><strong className="text-purple-400">Position Scarcity:</strong> Values increase for positions becoming scarce</li>
                  <li><strong className="text-purple-400">Budget Normalization:</strong> Total value of remaining players adjusts to match remaining league budget</li>
                </ul>
                <p className="text-xs text-dark-text-tertiary mt-2">
                  Example: If 5 RBs are drafted, the 36th best RB becomes the 31st best available, raising the replacement level and affecting all RB values
                </p>
              </div>
            </div>
          </Section>

          <Section id="market-price" title="Market Price" icon={<DollarSign className="w-5 h-5 text-yellow-400" />}>
            <div className="space-y-4 text-dark-text-secondary">
              <h4 className="font-semibold text-dark-text">What is Market Price?</h4>
              <p>
                The expected auction price based on market consensus (ADP and AAV data). This represents what other managers are likely to bid.
              </p>

              <h4 className="font-semibold text-dark-text mt-4">Calculation Method</h4>
              
              <div className="space-y-3">
                <div>
                  <strong>Primary Factors:</strong>
                  <ul className="list-disc list-inside ml-4">
                    <li><strong>AAV (Average Auction Value):</strong> Direct auction price from experts</li>
                    <li><strong>ESPN ADP:</strong> Converted to price using position-specific curves</li>
                    <li><strong>Draft Context:</strong> Inflation based on spent money and drafted players</li>
                  </ul>
                </div>

                <div>
                  <strong>ADP to Price Conversion:</strong>
                  <Formula>
                    Price = base × e^(-ADP / decay)
                  </Formula>
                  <p className="text-sm mt-2">Position-specific parameters (hardcoded):</p>
                  <ul className="list-disc list-inside ml-4 text-sm">
                    <li>RB: base=80, decay=25 (steep early dropoff)</li>
                    <li>WR: base=75, decay=28</li>
                    <li>TE: base=50, decay=40 (large tier gaps)</li>
                    <li>QB: base=45, decay=35</li>
                  </ul>
                </div>

                <div>
                  <strong>Confidence Weighting:</strong>
                  <p className="text-sm">Final price weights AAV vs ADP-derived price based on data availability:</p>
                  <ul className="list-disc list-inside ml-4 text-sm">
                    <li>If AAV exists: 60-80% weight to AAV</li>
                    <li>If only ADP: 100% ADP-derived price</li>
                    <li>Position-specific anchoring (TE more AAV-anchored than RB)</li>
                  </ul>
                </div>
              </div>
              
              <h4 className="font-semibold text-dark-text mt-6">Dynamic Updates During Draft</h4>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mt-2">
                <p className="text-sm text-dark-text-secondary mb-2">
                  Market prices adjust in real-time based on draft flow:
                </p>
                <ul className="list-disc list-inside ml-4 text-sm space-y-1">
                  <li><strong className="text-yellow-400">Inflation Rate:</strong> Calculated as <code className="text-xs bg-dark-bg px-1 rounded">totalRemaining / (availablePlayers × 10)</code> - increases as money is spent</li>
                  <li><strong className="text-yellow-400">Position Scarcity:</strong> Multiplier increases when positions get drafted heavily (1.0-1.15x)</li>
                  <li><strong className="text-yellow-400">Recent Prices:</strong> Last 10 picks influence expected prices (weighted 5-30% based on sample size)</li>
                  <li><strong className="text-yellow-400">Position Momentum:</strong> Detects "runs" on positions and adjusts accordingly</li>
                </ul>
                <p className="text-xs text-dark-text-tertiary mt-2">
                  Example: If RBs are going 20% over expected value, the model adjusts future RB prices upward to reflect market reality
                </p>
              </div>
            </div>
          </Section>

          <Section id="edge" title="Edge" icon={<BarChart className="w-5 h-5 text-red-400" />}>
            <div className="space-y-4 text-dark-text-secondary">
              <h4 className="font-semibold text-dark-text">What is Edge?</h4>
              <p>
                The percentage difference between intrinsic value and market price. Positive edge means the player is undervalued.
              </p>

              <Formula>
                Edge% = ((Intrinsic Value - Market Price) / Market Price) × 100
              </Formula>

              <h4 className="font-semibold text-dark-text mt-4">Recommendation Thresholds (Price-Tiered)</h4>
              <div className="space-y-3">
                <div className="text-sm text-dark-text-secondary mb-2">Thresholds adjust based on player price:</div>
                
                <div className="bg-dark-bg-secondary p-2 rounded">
                  <div className="text-xs font-semibold text-dark-text mb-1">Cheap Players ($1-3):</div>
                  <div className="text-xs space-y-1 ml-2">
                    <div>Strong Buy: Edge ≥ +30%</div>
                    <div>Buy: Edge ≥ +15%</div>
                    <div>Hold: -15% to +15%</div>
                    <div>Avoid: Edge ≤ -15%</div>
                    <div>Strong Avoid: Edge ≤ -30%</div>
                  </div>
                </div>
                
                <div className="bg-dark-bg-secondary p-2 rounded">
                  <div className="text-xs font-semibold text-dark-text mb-1">Mid-Range Players ($4-30):</div>
                  <div className="text-xs space-y-1 ml-2">
                    <div>Strong Buy: Edge ≥ +20%</div>
                    <div>Buy: Edge ≥ +8%</div>
                    <div>Hold: -8% to +8%</div>
                    <div>Avoid: Edge ≤ -8%</div>
                    <div>Strong Avoid: Edge ≤ -20%</div>
                  </div>
                </div>
                
                <div className="bg-dark-bg-secondary p-2 rounded">
                  <div className="text-xs font-semibold text-dark-text mb-1">Expensive Players ($30+):</div>
                  <div className="text-xs space-y-1 ml-2">
                    <div>Strong Buy: Edge ≥ +15%</div>
                    <div>Buy: Edge ≥ +6%</div>
                    <div>Hold: -6% to +6%</div>
                    <div>Avoid: Edge ≤ -6%</div>
                    <div>Strong Avoid: Edge ≤ -15%</div>
                  </div>
                </div>
              </div>

              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 mt-4">
                <p className="text-sm">
                  <strong className="text-green-400">Tip:</strong> Focus on players with positive edge. A +20% edge means you're getting $1.20 of value for every $1.00 spent.
                </p>
              </div>
            </div>
          </Section>

          <Section id="confidence" title="Confidence & CWE" icon={<Calculator className="w-5 h-5 text-cyan-400" />}>
            <div className="space-y-4 text-dark-text-secondary">
              <h4 className="font-semibold text-dark-text">Confidence Score (Conf)</h4>
              <p>
                How confident we are in the market price prediction (0-100%). Higher confidence means more reliable edge calculations.
              </p>

              <div className="space-y-2 text-sm">
                <strong>Factors that increase confidence:</strong>
                <ul className="list-disc list-inside ml-4">
                  <li>Having both AAV and ADP data (+30%)</li>
                  <li>Low ADP (top 50 picks) (+20%)</li>
                  <li>Position stability (QB/WR higher than RB)</li>
                  <li>Multiple corroborating data sources</li>
                </ul>
              </div>

              <h4 className="font-semibold text-dark-text mt-4">CWE (Confidence-Weighted Edge)</h4>
              <p>
                Edge adjusted for confidence. This is the most reliable metric for draft decisions.
              </p>

              <Formula>
                CWE = Edge% × (Confidence / 100)
              </Formula>

              <p className="text-sm mt-2">
                Example: +30% edge with 60% confidence = +18 CWE score
              </p>

              <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3 mt-4">
                <p className="text-sm">
                  <strong className="text-cyan-400">Usage:</strong> Sort by CWE to find the best opportunities that balance high edge with high confidence. A +15 CWE with 90% confidence is often better than +25 CWE with 50% confidence.
                </p>
              </div>
            </div>
          </Section>

          <Section id="hardcoded" title="Hardcoded Values" icon={<Code className="w-5 h-5 text-orange-400" />}>
            <div className="space-y-4 text-dark-text-secondary">
              <p className="text-sm text-orange-400">
                These values are hardcoded based on fantasy football theory and historical analysis. They cannot be derived from available data.
              </p>

              <div className="space-y-4">
                <div>
                  <strong className="text-dark-text">Streaming Uplift Percentages</strong>
                  <p className="text-sm">Based on waiver wire availability analysis:</p>
                  <ul className="list-disc list-inside ml-4 text-sm">
                    <li>DST: +30% - Teams stream based on matchups</li>
                    <li>K: +25% - Very streamable, matchup-dependent</li>
                    <li>QB: +12% - Streamable in good matchups</li>
                    <li>TE: +8% - Some streaming viability</li>
                    <li>WR: +5% - Limited streaming options</li>
                    <li>RB: +2% - Rarely streamable due to scarcity</li>
                  </ul>
                </div>

                <div>
                  <strong className="text-dark-text">Position Value Curve Exponents</strong>
                  <p className="text-sm">Based on historical tier analysis:</p>
                  <ul className="list-disc list-inside ml-4 text-sm">
                    <li>TE: 1.3 - Steepest dropoff (elite tier gap)</li>
                    <li>RB: 1.25 - Elite backs win leagues</li>
                    <li>WR: 1.15 - Moderate curve, deeper position</li>
                    <li>QB: 1.1 - Shallow curve, position is deep</li>
                  </ul>
                </div>

                <div>
                  <strong className="text-dark-text">Budget Caps (% of $200 budget)</strong>
                  <p className="text-sm">Maximum realistic spend per position:</p>
                  <ul className="list-disc list-inside ml-4 text-sm">
                    <li>RB: 50% ($100) - Elite RBs historically ~35-40%</li>
                    <li>WR: 45% ($90) - Top WRs historically ~30-35%</li>
                    <li>TE: 35% ($70) - Top TEs historically ~25-30%</li>
                    <li>QB: 30% ($60) - 40% in SuperFlex</li>
                    <li>K/DST: 3-4% ($6-8) - Never overpay</li>
                  </ul>
                </div>

                <div>
                  <strong className="text-dark-text">Recommendation Thresholds</strong>
                  <p className="text-sm">Price-tiered thresholds based on value capture analysis:</p>
                  <ul className="list-disc list-inside ml-4 text-sm">
                    <li>Cheap ($1-3): ±30% / ±15% thresholds</li>
                    <li>Mid-range ($4-30): ±20% / ±8% thresholds</li>
                    <li>Expensive ($30+): ±15% / ±6% thresholds</li>
                  </ul>
                  <p className="text-xs text-dark-text-tertiary mt-1">Higher percentage needed for cheap players to be meaningful</p>
                </div>
              </div>

              <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 mt-4">
                <p className="text-sm">
                  <strong className="text-orange-400">Note:</strong> These hardcoded values are based on fantasy football best practices and expert consensus. They could be made data-driven with access to historical draft results and season outcomes.
                </p>
              </div>
            </div>
          </Section>

          <Section id="usage-tips" title="How to Use This Tool" icon={<TrendingUp className="w-5 h-5 text-green-400" />}>
            <div className="space-y-4 text-dark-text-secondary">
              <h4 className="font-semibold text-dark-text">Draft Strategy</h4>
              
              <ol className="list-decimal list-inside space-y-3">
                <li>
                  <strong className="text-dark-text">Sort by CWE</strong>
                  <p className="text-sm ml-6">This balances edge with confidence for the most reliable opportunities</p>
                </li>
                
                <li>
                  <strong className="text-dark-text">Focus on Positive Edge</strong>
                  <p className="text-sm ml-6">Target players where Value &gt; Price (green edge percentages)</p>
                </li>
                
                <li>
                  <strong className="text-dark-text">Check Confidence</strong>
                  <p className="text-sm ml-6">Be cautious with low confidence (&lt;50%) predictions</p>
                </li>
                
                <li>
                  <strong className="text-dark-text">Monitor Market Inflation</strong>
                  <p className="text-sm ml-6">As money gets spent, remaining players become more expensive</p>
                </li>
                
                <li>
                  <strong className="text-dark-text">Balance Your Roster</strong>
                  <p className="text-sm ml-6">Don't chase value at the expense of filling required positions</p>
                </li>
              </ol>

              <h4 className="font-semibold text-dark-text mt-6">Key Metrics to Watch</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-dark-bg-secondary p-3 rounded-lg">
                  <strong className="text-draft-primary">For Value Hunting:</strong>
                  <ul className="text-sm mt-2 space-y-1">
                    <li>Sort by Edge%</li>
                    <li>Look for +15% or higher</li>
                    <li>Verify with CWE score</li>
                  </ul>
                </div>
                
                <div className="bg-dark-bg-secondary p-3 rounded-lg">
                  <strong className="text-draft-primary">For Safe Picks:</strong>
                  <ul className="text-sm mt-2 space-y-1">
                    <li>Sort by Confidence</li>
                    <li>Require 70%+ confidence</li>
                    <li>Accept lower edge (8-15%)</li>
                  </ul>
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mt-4">
                <p className="text-sm">
                  <strong className="text-blue-400">Tip:</strong> The best drafts combine 2-3 "home run" picks (high edge, moderate confidence) with consistent value picks (moderate edge, high confidence).
                </p>
              </div>
            </div>
          </Section>

        </div>
      </div>
    </div>
  );
};