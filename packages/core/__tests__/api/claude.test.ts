import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClaudeClient } from '../../src/api/claude.js';

// ---------------------------------------------------------------------------
// Global fetch mock
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function okJson(payload: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(payload),
    text: () => Promise.resolve(JSON.stringify(payload)),
  });
}

function errorResponse(status: number, body = 'Bad request') {
  return Promise.resolve({
    ok: false,
    status,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve({}),
  });
}

function claudeTextResponse(text: string) {
  return okJson({ content: [{ type: 'text', text }] });
}

const FAKE_KEY = 'sk-ant-test-key';

// ---------------------------------------------------------------------------
// chat()
// ---------------------------------------------------------------------------

describe('chat', () => {
  const client = createClaudeClient(FAKE_KEY);

  beforeEach(() => { mockFetch.mockReset(); });

  it('calls the correct Anthropic messages endpoint', async () => {
    mockFetch.mockResolvedValueOnce(claudeTextResponse('hello'));
    await client.chat([{ role: 'user', content: 'hi' }]);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
  });

  it('sets required Anthropic headers', async () => {
    mockFetch.mockResolvedValueOnce(claudeTextResponse('ok'));
    await client.chat([{ role: 'user', content: 'test' }]);
    const [, options] = mockFetch.mock.calls[0];
    const headers = options.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe(FAKE_KEY);
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('includes system prompt when provided', async () => {
    mockFetch.mockResolvedValueOnce(claudeTextResponse('ok'));
    await client.chat([{ role: 'user', content: 'test' }], 'You are an expert.');
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(body.system).toBe('You are an expert.');
  });

  it('omits system field when no system prompt given', async () => {
    mockFetch.mockResolvedValueOnce(claudeTextResponse('ok'));
    await client.chat([{ role: 'user', content: 'test' }]);
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(body.system).toBeUndefined();
  });

  it('returns first text content block', async () => {
    mockFetch.mockResolvedValueOnce(claudeTextResponse('answer text'));
    const result = await client.chat([{ role: 'user', content: 'q' }]);
    expect(result).toBe('answer text');
  });

  it('returns empty string when content array is empty', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ content: [] }));
    const result = await client.chat([{ role: 'user', content: 'q' }]);
    expect(result).toBe('');
  });

  it('throws on non-ok HTTP response', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(401, 'Unauthorized'));
    await expect(client.chat([{ role: 'user', content: 'q' }])).rejects.toThrow(
      'Claude API error: 401',
    );
  });

  it('uses claude-sonnet-4-20250514 model', async () => {
    mockFetch.mockResolvedValueOnce(claudeTextResponse('ok'));
    await client.chat([{ role: 'user', content: 'q' }]);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.model).toBe('claude-sonnet-4-20250514');
  });
});

// ---------------------------------------------------------------------------
// analyzeScenario()
// ---------------------------------------------------------------------------

const VALID_SCENARIO_JSON = JSON.stringify({
  stakeholders: [
    { name: 'SARB MPC', position: 60, salience: 95, power: 100, reasoning: 'Controls monetary policy' },
    { name: 'Treasury', position: 70, salience: 60, power: 40, reasoning: 'Wants growth stimulus' },
  ],
  analysis: 'SARB holds dominant power; Treasury wants lower rates for growth.',
});

describe('analyzeScenario', () => {
  const client = createClaudeClient(FAKE_KEY);

  beforeEach(() => { mockFetch.mockReset(); });

  it('returns parsed stakeholders and analysis', async () => {
    mockFetch.mockResolvedValueOnce(claudeTextResponse(VALID_SCENARIO_JSON));
    const result = await client.analyzeScenario('Will SARB cut rates?');
    expect(result.stakeholders).toHaveLength(2);
    expect(result.stakeholders[0].name).toBe('SARB MPC');
    expect(result.stakeholders[0].position).toBe(60);
    expect(result.analysis).toContain('SARB');
  });

  it('includes additional context in the user message', async () => {
    mockFetch.mockResolvedValueOnce(claudeTextResponse(VALID_SCENARIO_JSON));
    await client.analyzeScenario('Will SARB cut rates?', 'Inflation is at 4.5%');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.messages[0].content).toContain('Inflation is at 4.5%');
  });

  it('omits context section when not provided', async () => {
    mockFetch.mockResolvedValueOnce(claudeTextResponse(VALID_SCENARIO_JSON));
    await client.analyzeScenario('Will SARB cut rates?');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.messages[0].content).not.toContain('Additional context');
  });

  it('handles JSON wrapped in markdown code fences', async () => {
    const fenced = '```json\n' + VALID_SCENARIO_JSON + '\n```';
    mockFetch.mockResolvedValueOnce(claudeTextResponse(fenced));
    const result = await client.analyzeScenario('test');
    expect(result.stakeholders).toHaveLength(2);
  });

  it('throws when response contains no JSON', async () => {
    mockFetch.mockResolvedValueOnce(claudeTextResponse('Sorry, I cannot help with that.'));
    await expect(client.analyzeScenario('test')).rejects.toThrow('Failed to parse');
  });

  it('throws when Claude API returns an error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(429, 'Rate limited'));
    await expect(client.analyzeScenario('test')).rejects.toThrow('Claude API error: 429');
  });
});

// ---------------------------------------------------------------------------
// analyzeResult()
// ---------------------------------------------------------------------------

describe('analyzeResult', () => {
  const client = createClaudeClient(FAKE_KEY);

  beforeEach(() => { mockFetch.mockReset(); });

  const sampleResult = {
    predictedOutcome: 72,
    probability: 0.72,
    confidence: 0.85,
    stakeholderInfluence: [
      { name: 'SARB MPC', influence: 1.0 },
      { name: 'Treasury', influence: 0.4 },
      { name: 'Banking sector', influence: 0.3 },
      { name: 'Labour unions', influence: 0.1 },
    ],
  };

  it('returns prose text from Claude', async () => {
    const investmentText = 'Buy JSE-listed banks. Rates cut = NII compression short-term, but...';
    mockFetch.mockResolvedValueOnce(claudeTextResponse(investmentText));
    const result = await client.analyzeResult('Will SARB cut rates?', sampleResult);
    expect(result).toBe(investmentText);
  });

  it('includes predicted outcome and probability in the message', async () => {
    mockFetch.mockResolvedValueOnce(claudeTextResponse('analysis'));
    await client.analyzeResult('Will SARB cut rates?', sampleResult);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    const msg = body.messages[0].content as string;
    expect(msg).toContain('72/100');
    expect(msg).toContain('72.0%');
  });

  it('lists top 3 stakeholders in user message', async () => {
    mockFetch.mockResolvedValueOnce(claudeTextResponse('ok'));
    await client.analyzeResult('test', sampleResult);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    const msg = body.messages[0].content as string;
    expect(msg).toContain('SARB MPC');
    expect(msg).toContain('Treasury');
    // 4th stakeholder (Labour unions) should NOT appear (only top 3)
    expect(msg).not.toContain('Labour unions');
  });
});

// ---------------------------------------------------------------------------
// debate()
// ---------------------------------------------------------------------------

const VALID_DEBATE_JSON = JSON.stringify({
  rounds: [
    { speaker: 'SARB MPC', argument: 'Inflation must be anchored.' },
    { speaker: 'Treasury', argument: 'Growth needs support.', movesPosition: { from: 70, to: 68 } },
    { speaker: 'SARB MPC', argument: 'We will consider a modest 25bp cut.' },
  ],
  conclusion: 'A 25bp cut in Q2 is the most likely outcome.',
});

describe('debate', () => {
  const client = createClaudeClient(FAKE_KEY);

  beforeEach(() => { mockFetch.mockReset(); });

  const stakeholders = [
    { name: 'SARB MPC', position: 60, salience: 95, power: 100 },
    { name: 'Treasury', position: 70, salience: 60, power: 40 },
  ];

  it('returns parsed rounds and conclusion', async () => {
    mockFetch.mockResolvedValueOnce(claudeTextResponse(VALID_DEBATE_JSON));
    const result = await client.debate('Will SARB cut rates?', stakeholders);
    expect(result.rounds).toHaveLength(3);
    expect(result.rounds[0].speaker).toBe('SARB MPC');
    expect(result.rounds[1].movesPosition).toEqual({ from: 70, to: 68 });
    expect(result.conclusion).toContain('25bp');
  });

  it('includes stakeholder names in the user message', async () => {
    mockFetch.mockResolvedValueOnce(claudeTextResponse(VALID_DEBATE_JSON));
    await client.debate('test', stakeholders);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    const msg = body.messages[0].content as string;
    expect(msg).toContain('SARB MPC');
    expect(msg).toContain('Treasury');
  });

  it('handles JSON wrapped in markdown code fences', async () => {
    const fenced = '```json\n' + VALID_DEBATE_JSON + '\n```';
    mockFetch.mockResolvedValueOnce(claudeTextResponse(fenced));
    const result = await client.debate('test', stakeholders);
    expect(result.rounds).toHaveLength(3);
  });

  it('throws when response contains no JSON', async () => {
    mockFetch.mockResolvedValueOnce(claudeTextResponse('I refuse to debate this.'));
    await expect(client.debate('test', stakeholders)).rejects.toThrow('Failed to parse');
  });

  it('throws when Claude API returns an error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(500, 'Server error'));
    await expect(client.debate('test', stakeholders)).rejects.toThrow('Claude API error: 500');
  });
});
