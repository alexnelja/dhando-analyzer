/**
 * Claude API client for LLM-powered game theory and investment analysis.
 *
 * Uses the Anthropic Messages API directly via fetch. Designed to work in
 * both Node.js (Electron main process) and browser environments.
 *
 * Reference: https://docs.anthropic.com/en/api/messages
 */

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Stakeholder with game-theory parameters as identified by Claude. */
export interface ClaudeStakeholder {
  name: string;
  /** Desired policy position on a 0–100 scale. */
  position: number;
  /** How intensely the stakeholder cares (0–100). */
  salience: number;
  /** Relative political/economic power (0–100). */
  power: number;
  /** Claude's reasoning for the assigned values. */
  reasoning: string;
}

/** Return type for analyzeScenario. */
export interface ScenarioAnalysis {
  stakeholders: ClaudeStakeholder[];
  /** Brief analysis of the scenario dynamics and key tensions. */
  analysis: string;
}

/** Debate round produced by the debate simulation. */
export interface DebateRound {
  speaker: string;
  argument: string;
  movesPosition?: { from: number; to: number };
}

/** Full debate result. */
export interface DebateResult {
  rounds: DebateRound[];
  conclusion: string;
}

const SCENARIO_SYSTEM_PROMPT = `You are an expert in game theory and political/economic analysis, specifically Bruce Bueno de Mesquita's Expected Utility Model from "The Predictioneer's Game."

Your task: Given a scenario, identify the key stakeholders and estimate their:
- Position (0-100): What outcome do they want? 0 = completely against, 100 = completely in favor
- Salience (0-100): How much do they care about this issue? 0 = indifferent, 100 = top priority
- Power (0-100): How much influence can they exert? 0 = no power, 100 = dominant

Focus on South African political economy, SARB, government, business, labor, and international actors where relevant.

IMPORTANT: Respond ONLY in valid JSON format:
{
  "stakeholders": [
    { "name": "...", "position": 0-100, "salience": 0-100, "power": 0-100, "reasoning": "..." }
  ],
  "analysis": "Brief analysis of the scenario dynamics and key tensions"
}`;

const DEBATE_SYSTEM_PROMPT = `You are simulating a negotiation/debate between stakeholders on a political/economic scenario, following Mesquita's game theory principles.

Simulate 3-4 rounds of negotiation. In each round:
1. The most powerful stakeholder states their position
2. Other stakeholders respond with counter-arguments
3. Some stakeholders shift their positions based on the arguments

Respond in JSON:
{
  "rounds": [
    { "speaker": "stakeholder name", "argument": "their argument", "movesPosition": { "from": 60, "to": 65 } }
  ],
  "conclusion": "Summary of where things are likely to land and why"
}`;

const INVESTMENT_SYSTEM_PROMPT = `You are an investment analyst who uses game theory predictions to assess investment implications. Be specific about which SA companies/sectors would be affected and how. Be concise but actionable.`;

/**
 * Create a typed Claude API client.
 *
 * @param apiKey - Anthropic API key (from ANTHROPIC_API_KEY env var).
 * @returns Object with chat, analyzeScenario, analyzeResult, and debate methods.
 */
export function createClaudeClient(apiKey: string) {
  /**
   * Core chat method. Sends a messages array to the Anthropic API and returns
   * the first text content block from the response.
   */
  async function chat(messages: ClaudeMessage[], systemPrompt?: string): Promise<string> {
    const body: Record<string, unknown> = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    const response = await fetch(`${ANTHROPIC_BASE}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API error: ${response.status} — ${err}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text ?? '';
  }

  /**
   * Extract JSON from a Claude response that may be wrapped in markdown code fences.
   */
  function extractJson(text: string): unknown {
    // Strip ```json ... ``` or ``` ... ``` wrappers if present
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = fenced ? fenced[1].trim() : text;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object found in Claude response');
    return JSON.parse(jsonMatch[0]);
  }

  return {
    chat,

    /**
     * Analyze a scenario and identify stakeholders with game theory parameters.
     * Claude returns a structured JSON object with stakeholders and analysis text.
     */
    async analyzeScenario(scenario: string, context?: string): Promise<ScenarioAnalysis> {
      const userMsg = context
        ? `Scenario: ${scenario}\n\nAdditional context: ${context}`
        : `Scenario: ${scenario}`;

      const response = await chat(
        [{ role: 'user', content: userMsg }],
        SCENARIO_SYSTEM_PROMPT,
      );

      try {
        return extractJson(response) as ScenarioAnalysis;
      } catch (err) {
        throw new Error(`Failed to parse Claude scenario response: ${err}`);
      }
    },

    /**
     * Analyze the prediction result and provide SA investment implications.
     * Returns a prose string — no JSON parsing required.
     */
    async analyzeResult(
      scenario: string,
      result: {
        predictedOutcome: number;
        probability: number;
        confidence: number;
        stakeholderInfluence: { name: string; influence: number }[];
      },
    ): Promise<string> {
      const topStakeholders = result.stakeholderInfluence
        .slice(0, 3)
        .map((s) => `${s.name} (${(s.influence * 100).toFixed(0)}%)`)
        .join(', ');

      const userMsg = `Scenario: ${scenario}

Game Theory Prediction Result:
- Predicted Outcome: ${result.predictedOutcome}/100 (${result.probability > 0.5 ? 'likely to happen' : 'unlikely'})
- Probability: ${(result.probability * 100).toFixed(1)}%
- Model Confidence: ${(result.confidence * 100).toFixed(0)}%
- Most Influential Stakeholders: ${topStakeholders}

What are the investment implications for a South African value investor? Which JSE sectors/stocks would benefit or suffer? How should this affect portfolio positioning?`;

      return chat([{ role: 'user', content: userMsg }], INVESTMENT_SYSTEM_PROMPT);
    },

    /**
     * Simulate a structured negotiation debate between the given stakeholders.
     * Claude produces 3-4 rounds of arguments with position shifts and a conclusion.
     */
    async debate(
      scenario: string,
      stakeholders: { name: string; position: number; salience: number; power: number }[],
    ): Promise<DebateResult> {
      const stakeholderList = stakeholders
        .map(
          (s) =>
            `- ${s.name}: Position ${s.position}/100, Salience ${s.salience}/100, Power ${s.power}/100`,
        )
        .join('\n');

      const userMsg = `Scenario: ${scenario}\n\nStakeholders:\n${stakeholderList}\n\nSimulate the negotiation.`;

      const response = await chat([{ role: 'user', content: userMsg }], DEBATE_SYSTEM_PROMPT);

      try {
        return extractJson(response) as DebateResult;
      } catch (err) {
        throw new Error(`Failed to parse Claude debate response: ${err}`);
      }
    },
  };
}

export type ClaudeClient = ReturnType<typeof createClaudeClient>;
