# Improving Probability Estimates for Kelly Criterion in Value Investing

## Research Context

Mohnish Pabrai's Kelly formula: **f* = (bp - q) / b**, where b = odds (payoff ratio), p = probability of winning, q = probability of losing (1-p). The entire system hinges on the accuracy of p. As Ed Thorp warns: "Great sensitivity to parameter estimates, especially the means, makes the strategy dangerous to those whose estimates are in error."

Pabrai himself has acknowledged that "the Kelly Formula is actually not very relevant to equity investing or value investing as most practice it" -- precisely because estimating p in markets is fundamentally harder than in blackjack. The techniques below address that gap.

---

## 1. IMPROVING PROBABILITY ESTIMATES

### 1.1 Superforecasting Techniques (Tetlock)

Philip Tetlock's Good Judgment Project found that trained amateurs outperformed intelligence analysts with access to classified data. The key techniques:

**Outside View First, Inside View Second**
- Start by asking: "What is the base rate for this class of event?" (e.g., "What percentage of deep-value stocks trading below book actually recover within 3 years?")
- Only AFTER anchoring on the base rate, examine case-specific details
- If the specific case has exceptional features, adjust UP or DOWN from the base rate
- Kahneman called this the single most important debiasing technique

**Fermi-Style Decomposition**
- Break the complex question "Will this stock double in 3 years?" into components:
  - P(revenue grows >10% annually) = ?
  - P(margins expand to industry average) = ?
  - P(multiple re-rates from 6x to 10x earnings) = ?
  - P(no catastrophic risk materializes) = ?
- Estimate each component separately, then combine
- Overestimates and underestimates tend to cancel out across components
- This is directly applicable to building a software scoring tool

**Granularity in Probability Estimates**
- Superforecasters use fine-grained probabilities (67% not "likely")
- They update frequently in small increments as new data arrives
- They distinguish between 60% and 65% -- this precision forces careful thinking

**Perpetual Beta Mindset**
- The strongest predictor of forecasting accuracy is "commitment to self-improvement"
- Treat every estimate as a hypothesis to be tested, not a conclusion to defend
- Track your estimates vs outcomes over time (see Section 6)

### 1.2 How Professional Gamblers Calibrate

**Poker Players (Annie Duke's Framework)**
- Separate decision quality from outcome quality -- a good 70% bet loses 30% of the time
- Express ALL beliefs as probabilities, never as certainties
- Create a "truth-seeking group" of peers who challenge your estimates
- Ask: "How much would I bet on this at these odds?" -- this reveals true conviction vs stated conviction

**Blackjack (Ed Thorp)**
- Thorp's edge: he could calculate exact probabilities from card counting
- Key lesson for investors: the closer you can get to a KNOWN mathematical edge, the more aggressively you should use Kelly
- When the edge is estimated (as in investing), reduce your Kelly fraction proportionally to your uncertainty about the edge

### 1.3 How Institutional Investors Calibrate

**Bridgewater (Ray Dalio) -- Believability-Weighted Decision Making**
- Each person is rated on their track record and expertise per topic
- When making probability estimates, weight each contributor's input by their "believability score"
- Decisions emerge from weighted aggregation, not from the loudest voice or the highest-ranking person
- For a solo investor: simulate this by weighting different analytical methods by their historical accuracy

**Renaissance Technologies**
- Uses massive historical datasets to find statistical patterns
- Key principle: let the data speak rather than constructing narratives
- Their edge comes from finding small but reliable probabilities across thousands of positions
- Lesson for value investors: even small improvements in probability calibration compound enormously over many decisions

### 1.4 Reference Class Forecasting

**The Three-Step Process:**
1. **Identify the reference class**: Find a group of historically comparable situations (e.g., "companies trading below liquidation value in cyclical industries during downturns")
2. **Compile the distribution**: What percentage recovered? What was the median outcome? What was the worst case?
3. **Position your specific case**: Based on case-specific factors, where does this stock fall within that distribution?

**Practical Rules for Reference Class Selection:**
- Keep reference classes simple -- adjust only for "obviously important and objective factors"
- When multiple reference classes seem valid, AVERAGE across them to prevent cherry-picking
- For rare events with no historical precedent, use Laplace's Rule of Succession: P = 1/(n+2) where n = number of opportunities where the event could have occurred but didn't

**Investment Examples:**
- "What % of stocks trading at <0.5x book value returned to book value within 5 years?" (historical base rate)
- "What % of companies with F-Score >= 7 outperformed the market over 2 years?"
- "What % of turnaround situations in mining actually succeeded?"

---

## 2. KELLY CRITERION VARIANTS FOR INVESTING

### 2.1 The General Kelly Formula for Investing

The standard binary-bet Kelly (f* = (bp - q) / b) is too simple for markets. The general form for investments:

**f* = W/A - (1-W)/B**

Where:
- W = probability of winning
- A = size of potential loss (as a fraction of capital)
- B = size of potential gain (as a fraction of capital)

For example: 60% chance of +40%, 40% chance of -20%:
- f* = 0.60/0.20 - 0.40/0.40 = 3.0 - 1.0 = 2.0 (i.e., 200% -- lever up)

This is why practitioners use fractional Kelly -- full Kelly often suggests extreme positions.

### 2.2 Fractional Kelly -- Why Nearly Everyone Reduces

**The Core Trade-off:**
- Betting at fraction f of Kelly (e.g., half-Kelly = 0.5 * Kelly):
  - Growth rate scales roughly proportionally to f (near optimal)
  - Variance scales as f-squared
- **Half-Kelly returns ~75% of Kelly-optimal growth with only 25% of the variance**
- This is widely considered the most important practical insight for Kelly users

**Why Practitioners Reduce Kelly:**

1. **Estimation error**: If your p is wrong, full Kelly amplifies the error. With an overestimated edge, full Kelly can lead to ruin. Half-Kelly provides a massive buffer.
2. **Fat tails**: Markets have fatter tails than normal distributions. A -40% "impossible" drawdown is far more common than models predict. Reducing Kelly accounts for this.
3. **Psychological survival**: Even if full Kelly is mathematically optimal, the drawdowns it produces (potentially 50%+) will cause most investors to abandon the strategy.
4. **Correlation shocks**: In crises, correlations spike to 1.0. Positions that seemed independent become a single concentrated bet.

**Ed Thorp's Recommendation:**
- Thorp himself advocated fractional Kelly for investing
- A "fractional Kelly investor turns out to be a full Kelly investor who uses shrinkage estimates of the markets' parameters" -- i.e., fractional Kelly is mathematically equivalent to being more conservative about your edge estimate
- Rule of thumb: the less certain you are about your probability estimates, the smaller your Kelly fraction should be

### 2.3 Multiple Simultaneous Bets (Portfolio Kelly)

When holding multiple positions simultaneously:
- Optimal position sizes are SMALLER than individual Kelly calculations suggest
- The distribution of capital across positions differs dramatically from sequential betting
- Correlation between bets must be accounted for
- For a portfolio of N uncorrelated bets with similar characteristics, each position is roughly 1/N of what single-bet Kelly would suggest
- In practice: calculate individual Kelly sizes, then scale down by the number of positions AND a safety factor

### 2.4 Sequential Kelly (Bayesian Updating)

As new information arrives:
1. Recalculate p based on updated evidence
2. Recalculate Kelly fraction
3. Adjust position size accordingly
- This is how professional poker players adjust -- they constantly update pot odds as cards are revealed
- For investing: earnings reports, macro data, competitive developments should all trigger re-estimation of p and corresponding position adjustment

### 2.5 Kelly with Fat Tails

Standard Kelly assumes a known, well-behaved probability distribution. Adjustments for reality:
- Use half-Kelly or less as a default to account for tail risk
- Consider the "barbell strategy" (Taleb): combine very safe positions with small, asymmetric bets
- Never assume the worst case is limited to your estimated downside -- leave room for outcomes worse than your model
- The 2008 crisis, COVID crash, etc. demonstrate that "impossible" events happen regularly

### 2.6 Key Result from Academic Research

From Frontiers in Applied Mathematics and Statistics:
- Kelly portfolios outperform alternatives consistently after ~1,000+ decisions
- A 24-month rolling window for parameter estimation showed optimal results
- Kelly portfolios achieve higher Sharpe ratios out-of-sample
- Shorter estimation windows paradoxically yield better results than longer ones (markets change)

---

## 3. CALIBRATION TOOLS AND TECHNIQUES

### 3.1 Brier Scores

The Brier Score measures how good your probability estimates are:

**BS = (1/N) * SUM(forecast_i - outcome_i)^2**

Where forecast_i is your probability estimate (0 to 1) and outcome_i is the actual result (0 or 1).

- Perfect calibration = 0.0
- Random guessing on 50/50 outcomes = 0.25
- Always saying 50% = 0.25 (no skill, but well-calibrated)
- Meteorologists typically score 0.1-0.15

**Decomposition into three components:**
1. **Calibration** (reliability): Are your 70% predictions right 70% of the time?
2. **Resolution** (discrimination): Do you distinguish between different probability levels? (Always saying 50% has zero resolution)
3. **Uncertainty** (base rate difficulty): How inherently unpredictable is the domain?

**For a solo investor's software tool:**
- Track every probability estimate alongside the actual outcome
- After 50+ predictions, compute your Brier score
- Plot calibration curves: bin your predictions (50-59%, 60-69%, etc.) and compare predicted vs actual hit rates
- Identify systematic biases (e.g., "I'm overconfident -- my 80% predictions only come true 65% of the time")

### 3.2 Calibration Training Exercises

**Low-Stakes Practice:**
- Make daily predictions about anything: weather, sports results, business outcomes
- Assign probability estimates and track outcomes
- A 2024 study found managers using decision journals improved forecasting accuracy by 19%

**Specific Exercises:**
1. **Trivia calibration**: Answer factual questions with confidence intervals. "I'm 90% sure the population of Nigeria is between X and Y." Track how often reality falls in your 90% interval (should be ~90%)
2. **Equivalent bet test**: "Would I rather bet on this stock doubling, or draw a red ball from a bag with 7 red and 3 blue?" This forces honest probability assessment
3. **Frequency format reframing**: Instead of "What's the probability this company goes bankrupt?" ask "Out of 100 companies in this exact situation, how many would go bankrupt?"

### 3.3 Pre-Mortem Technique (Gary Klein)

**Process:**
1. State your investment thesis: "Company X will double in 2 years"
2. Imagine it is 2 years from now and the investment FAILED
3. Write down every plausible reason for failure
4. Assign rough probabilities to each failure mode
5. If total failure probability exceeds your assumed q (1-p), adjust your Kelly sizing

**Research shows this reduces overconfidence by ~30%** and surfaces risks that optimistic analysis suppresses. The key is the temporal shift -- imagining the failure has ALREADY happened bypasses the psychological barrier of considering failure while still committed to a thesis.

**Double-Barreled Pre-Mortem:**
- Also imagine the investment succeeded BEYOND expectations
- Write down why -- this can reveal upside scenarios you hadn't priced in
- This prevents excessive pessimism while maintaining the debiasing effect

### 3.4 Red Team / Devil's Advocate

- Before finalizing a probability estimate, explicitly argue the OTHER side
- Write a 1-page "bear case" for every "bull case" and vice versa
- Force yourself to find at least 3 reasons the thesis is wrong
- If you can't find strong counter-arguments, you may not understand the situation well enough

### 3.5 Decomposition for Investment Probabilities

**Template for decomposing "Will this investment succeed?":**

```
P(thesis works) = P(value correctly estimated)
                  x P(catalyst materializes)
                  x P(no thesis-killing risk)
                  x P(market recognizes value in time)
```

Each sub-probability is easier to estimate from base rates:
- "What % of my DCF models have been within 20% of realized value?" -> P(value correctly estimated)
- "What % of expected catalysts actually happened within my timeframe?" -> P(catalyst materializes)
- "What's the base rate of permanent capital loss for this type of situation?" -> 1 - P(no thesis-killing risk)
- "What's the typical timeframe for value realization in similar situations?" -> P(market recognizes value in time)

---

## 4. COMBINING MULTIPLE SIGNALS FOR BETTER PROBABILITIES

### 4.1 Quantitative Scores as Probability Inputs

**Piotroski F-Score (0-9):**
- Historical backtest data shows stocks with F-Score >= 7 outperform significantly
- This can be converted to a probability: "Historically, X% of F-Score 8+ stocks outperformed over Y years"
- Use as one input to your prior probability

**Altman Z-Score:**
- Z < 1.8: high bankruptcy probability
- Z > 3.0: safe zone
- The Z-Score was literally designed as a probability predictor -- use it as such

**Combined approach:**
- F-Score for financial health trajectory (improving or deteriorating)
- Z-Score for bankruptcy/distress risk
- Margin of safety (price vs intrinsic value) for downside protection
- Each score independently adjusts your probability estimate

### 4.2 Bayesian Updating Framework

**Step-by-step for investment decisions:**

1. **Establish Prior**: Use reference class base rate
   - "70% of stocks trading below book value in this sector recovered within 5 years"
   - Prior P(success) = 0.70

2. **Update with Evidence**: For each new piece of information, ask:
   - "How likely would I see this evidence if my thesis is RIGHT?"
   - "How likely would I see this evidence if my thesis is WRONG?"
   - The ratio of these = the "likelihood ratio"

3. **Apply Bayes' Rule**:
   - Posterior odds = Prior odds x Likelihood ratio
   - Example: Prior P = 0.70, so prior odds = 0.70/0.30 = 2.33
   - New evidence: CEO buying shares. If thesis right, P(CEO buys) = 0.40. If thesis wrong, P(CEO buys) = 0.05
   - Likelihood ratio = 0.40/0.05 = 8
   - Posterior odds = 2.33 x 8 = 18.67
   - Posterior P = 18.67/(1+18.67) = 0.949

4. **Cascade through timeframes** (from the systematic investor framework):
   - Long-term base rate (70+ years of data) -> adjust with long-term factors -> adjust with medium-term factors -> adjust with short-term factors
   - Each layer either confirms or adjusts the probability from the previous level

**Critical Rule**: Not all evidence deserves equal weight. Ask "How diagnostic is this information?" A CEO buying $50M of stock is far more diagnostic than an analyst upgrade.

### 4.3 Ensemble Methods

**Wisdom of Crowds for Solo Investors:**
- Research confirms "a simple median is an unexpectedly powerful aggregation mechanism"
- Generate 3-5 independent estimates using different methods:
  1. DCF-based probability (value estimate vs current price)
  2. Quantitative score-based probability (F-Score, Z-Score, quality metrics)
  3. Historical base rate from reference class
  4. Expert consensus / analyst estimates
  5. Your qualitative assessment of management and competitive position
- Take the median of these estimates as your working probability
- If estimates diverge widely, that itself signals high uncertainty -- reduce Kelly fraction

**Inner Crowd Effect:**
- Research shows that making the SAME estimate multiple times using different analytical frames, then averaging, improves accuracy
- This is "the wisdom of your inner crowd" -- estimate the probability from the bull case, from the bear case, from a purely quantitative view, and average

### 4.4 Weighting Different Evidence Types

A practical hierarchy for diagnostic power:
1. **Strongest**: Insider actions (buying/selling), hard financial data, contract wins/losses
2. **Strong**: Industry-level base rates, comparable company outcomes, quantitative scores
3. **Moderate**: Management guidance, analyst estimates, macro indicators
4. **Weakest**: Narrative/story, media sentiment, your "gut feel"

Weight your probability updates proportionally. A strong signal should move your estimate more than a weak one.

---

## 5. COMMON BIASES THAT CORRUPT PROBABILITY ESTIMATES

### 5.1 Overconfidence Bias

**The Central Problem**: Kahneman called this "the most significant of the cognitive biases." Studies consistently show investors' 90% confidence intervals contain the true value only 50-70% of the time.

**Corrections:**
- Widen your confidence intervals by 50% as a default
- After making a probability estimate, ask: "If I had to bet my entire portfolio on this, would I still say the same number?"
- Track your calibration over time -- most investors discover they are overconfident by 15-20 percentage points
- Use the "equivalent bet" test: "Would I bet on this at 4:1 odds?" forces honest assessment of a claimed 80% probability

### 5.2 Anchoring in Valuation

**The Problem**: Your first estimate of intrinsic value becomes an anchor. All subsequent analysis adjusts insufficiently from that anchor.

**Corrections:**
- Calculate intrinsic value using 3 different methods BEFORE looking at any of the results
- Have someone else independently value the same company
- Deliberately start from an extreme assumption and work backward: "At what price would this stock be a clear sell?" and "At what price would this be a screaming buy?"
- Be especially wary of anchoring to the current market price

### 5.3 Confirmation Bias

**The Problem**: After forming a thesis, you unconsciously seek confirming evidence and discount disconfirming evidence. This inflates your probability estimate.

**Corrections:**
- Before researching, write down: "What specific evidence would DISPROVE my thesis?"
- Actively seek out the bear case -- read the short sellers' arguments
- Track disconfirming evidence with the same rigor as confirming evidence
- Assign a "devil's advocate" role (even if it is just a checklist you force yourself through)

### 5.4 Narrative Fallacy

**The Problem**: Taleb defined this as "our limited ability to look at sequences of facts without weaving an explanation into them." A compelling turnaround story makes you assign higher probability to success than the base rate justifies.

**The Test**: Taleb showed that people assessing odds influenced by a compelling narrative will assign probabilities that sum to MORE than 100%. If your probability estimates for various outcomes exceed 100%, narrative fallacy is at work.

**Corrections:**
- Strip the story away and look at the numbers alone: "If I showed someone ONLY the financial statements with no company name or backstory, what would they estimate?"
- "Favor experimentation over storytelling, experience over history, and clinical knowledge over theories" (Taleb)
- Quantify every element of the narrative: "Management says they'll cut costs by 30%. What's the base rate of companies achieving announced cost-cutting targets?"

### 5.5 Inside View vs Outside View

**Inside View** (dangerous default): "This specific company has a great new CEO, improving margins, and a clear catalyst. I estimate 80% chance of success."

**Outside View** (where you should start): "Of all companies in similar financial distress with new CEOs, what percentage successfully turned around? The base rate is 35%."

**The Resolution**: Start with the outside view (35%), then adjust for genuinely exceptional inside-view factors. The result will almost always be lower than a pure inside-view estimate, and historically, more accurate.

---

## 6. PRACTICAL IMPLEMENTATION -- BUILDING A SOFTWARE TOOL

### 6.1 Probability Estimation Worksheet

For each investment, the tool should capture:

```
=== PROBABILITY ESTIMATION WORKSHEET ===

Company: _______________
Date: _______________
Analyst: _______________

--- STEP 1: REFERENCE CLASS BASE RATE ---
Reference class: _______________
(e.g., "Deep value stocks at <0.5x book in mining sector")
Historical success rate: ___% (source: ___)
Starting probability (outside view): ___%

--- STEP 2: QUANTITATIVE ADJUSTMENTS ---
Piotroski F-Score: ___ / 9    Adjustment: +/-___%
Altman Z-Score: ___           Adjustment: +/-___%
Margin of Safety: ___%        Adjustment: +/-___%
Insider buying/selling: ___   Adjustment: +/-___%

--- STEP 3: QUALITATIVE ADJUSTMENTS ---
Management quality: ___       Adjustment: +/-___%
Competitive position: ___     Adjustment: +/-___%
Catalyst identified: Y/N      Adjustment: +/-___%
Thesis-killing risks: ___     Adjustment: +/-___%

--- STEP 4: DECOMPOSED PROBABILITY ---
P(value correctly estimated):      ___%
P(catalyst materializes):          ___%
P(no permanent capital loss):      ___%
P(market recognizes value):        ___%
Combined P(success):               ___%

--- STEP 5: BIAS CORRECTION ---
Pre-mortem conducted: Y/N
# of failure modes identified: ___
Bear case written: Y/N
Overconfidence adjustment: -___%
(Default: subtract 15% if no calibration track record)

--- STEP 6: FINAL ESTIMATE ---
Adjusted P(success):           ___%
Estimated upside if right:     ___%
Estimated downside if wrong:   ___%

--- STEP 7: KELLY CALCULATION ---
Kelly fraction (full):         ___%
Applied fraction (half-Kelly): ___%
Position size (% of portfolio): ___%

--- STEP 8: TRACKING ---
Outcome (fill in later): ___
Actual return: ___%
Was thesis correct: Y/N
Calibration note: ___
```

### 6.2 Decision Journal Requirements

The tool should track:
- **Date and emotional state** when estimate was made (studies show mood affects estimates)
- **The specific probability assigned** (not vague words like "likely")
- **The key assumptions** (so you can see which assumptions were wrong, not just whether the outcome was right)
- **Alternatives considered and rejected** (to combat confirmation bias after the fact)
- **Confidence level in the probability itself** (meta-uncertainty: "I'm 60% confident that the true probability is between 55% and 75%")

### 6.3 Calibration Dashboard

After 50+ tracked predictions, display:
- **Calibration curve**: Predicted probability (x-axis) vs actual outcome frequency (y-axis). Perfect calibration = 45-degree line
- **Brier score** over time (trending down = improving)
- **Brier decomposition**: Separate calibration, resolution, and uncertainty scores
- **Overconfidence index**: Average predicted probability minus average outcome frequency
- **Hit rate by category**: Are you better at estimating financial distress? Turnarounds? Growth stocks?
- **Kelly performance**: Actual portfolio growth vs Kelly-optimal growth vs half-Kelly growth

### 6.4 Automated Checks the Tool Should Perform

1. **Probabilities sum check**: If user enters P(up >50%) + P(up 20-50%) + P(flat) + P(down) != ~100%, flag it
2. **Base rate deviation alert**: If user's estimate differs from reference class base rate by >20 percentage points, require written justification
3. **Concentration warning**: If Kelly suggests >25% in a single position, flag for review
4. **Correlation check**: If multiple positions share sector/factor exposure, warn about correlated risk
5. **Track record weighting**: As user builds calibration history, automatically adjust estimates toward their historical accuracy (e.g., if user's 80% predictions are actually 65% right, auto-suggest adjustment)

### 6.5 Specific Implementation Recommendations

**For the MineMarket platform or a standalone tool:**

1. **Scoring Engine**: Convert F-Score, Z-Score, and margin-of-safety into calibrated probabilities using historical backtests. E.g., build a lookup table: "F-Score 8 + Z-Score > 3.0 + MOS > 40% -> historical win rate = 72% over 3-year holding period"

2. **Bayesian Update Module**: When user logs a new piece of evidence (earnings beat, insider purchase, analyst downgrade), automatically suggest a probability adjustment based on the diagnostic power of that evidence type

3. **Multi-Method Ensemble**: Run 3-5 valuation methods in parallel (DCF, relative valuation, asset-based, earnings power), convert each to a probability-weighted expected return, and take the median

4. **Pre-Mortem Generator**: Prompt the user with category-specific failure modes (e.g., for mining companies: "regulatory risk," "commodity price collapse," "reserve estimation error," "water rights dispute," "labor action")

5. **Calibration Feedback Loop**: After each resolved position, update the user's personal calibration profile and use it to automatically adjust future estimates

---

## 7. SYNTHESIS: A PRACTICAL WORKFLOW

For a Dhandho-style value investor using Kelly:

### Before Investing (Probability Estimation)
1. **Find your reference class** and anchor on the base rate (outside view)
2. **Run quantitative scores** (F-Score, Z-Score, quality metrics) and convert to probability adjustments
3. **Decompose** the thesis into independent sub-probabilities using Fermi-style analysis
4. **Update with Bayesian framework** as you gather case-specific evidence
5. **Run a pre-mortem** -- imagine the investment failed and list all reasons why
6. **Apply overconfidence correction** -- subtract 15% from your estimate if you have no calibration track record, or use your historical bias factor
7. **Generate multiple estimates** using different methods and take the median (ensemble)

### Position Sizing (Kelly Application)
8. **Calculate full Kelly** using: f* = W/A - (1-W)/B
9. **Apply half-Kelly or less** -- never use full Kelly with estimated (vs known) probabilities
10. **Check portfolio concentration** -- if multiple Kelly-sized positions, reduce each proportionally
11. **Set a hard ceiling** -- Pabrai style: no single position > 10% of portfolio (or whatever your maximum pain tolerance is)

### After Investing (Calibration)
12. **Log everything** -- probability estimate, key assumptions, emotional state, alternatives considered
13. **Update probability** as new information arrives (sequential Kelly / Bayesian updating)
14. **Adjust position size** when probability estimate changes materially
15. **Record outcome** and compare to prediction when position is closed
16. **Compute Brier score** periodically and review calibration curves
17. **Identify systematic biases** and build correction factors into future estimates

### The Compounding Effect
The entire system is designed to create a **feedback loop**: better probability estimates lead to better Kelly sizing, which leads to better returns, AND tracking outcomes leads to better calibration, which leads to even better probability estimates. Over time, this compounds both financially and intellectually.

---

## KEY TAKEAWAYS

1. **Start with base rates, not stories.** The single biggest improvement most investors can make.
2. **Use half-Kelly or less.** Full Kelly with estimated probabilities is a recipe for ruin.
3. **Decompose probabilities.** Break "Will this work?" into 4-5 sub-questions you can estimate more reliably.
4. **Track everything.** You cannot improve what you do not measure. Build a calibration track record.
5. **Combine multiple methods.** The median of 3-5 independent estimates beats any single method.
6. **Correct for overconfidence.** Subtract 15% from your probability estimate as a starting default until your track record proves otherwise.
7. **Update continuously.** Bayesian updating as new evidence arrives is how professionals stay calibrated.
8. **The pre-mortem is mandatory.** Imagining failure improves risk assessment by ~30%.
9. **Fat tails are real.** Markets are not normal distributions. Always leave room for outcomes worse than your model predicts.
10. **Separate process from outcome.** A good 70% probability bet that loses was still a good bet. Judge your process, not individual results.
