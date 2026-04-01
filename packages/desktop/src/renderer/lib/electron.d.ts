/**
 * Type declarations for the window.dhando IPC bridge exposed by preload.ts.
 */

interface DhandoApi {
  init: () => Promise<{ ok: boolean }>;

  watchlist: {
    list: (status?: string) => Promise<unknown[]>;
    add: (data: unknown) => Promise<string>;
    advance: (id: string) => Promise<{ ok: boolean }>;
    remove: (id: string) => Promise<{ ok: boolean }>;
    update: (id: string, updates: unknown) => Promise<{ ok: boolean }>;
  };

  screen: (...args: unknown[]) => Promise<unknown>;
  analyze: (input: unknown) => Promise<unknown>;

  portfolio: {
    list: () => Promise<unknown[]>;
    upsert: (data: unknown) => Promise<unknown>;
    close: (investmentId: string, exitPrice: number) => Promise<{ ok: boolean }>;
    dashboard: (inputs: unknown) => Promise<unknown>;
    trafficLight: (input: unknown) => Promise<unknown>;
  };

  rules: {
    list: () => Promise<unknown[]>;
    load: (dir: string) => Promise<{ loaded: number; ids: string[] }>;
    create: (rule: unknown) => Promise<string>;
  };

  distress: {
    check: (input: unknown) => Promise<unknown>;
  };

  privateMarkets: {
    analyze: (input: unknown) => Promise<unknown>;
  };

  macro: {
    vix: () => Promise<unknown>;
    creditSpread: () => Promise<unknown>;
    yieldCurve: () => Promise<unknown>;
    fedRate: () => Promise<unknown>;
    sentiment: () => Promise<unknown>;
    saRepo: () => Promise<unknown>;
    zarUsd: () => Promise<unknown>;
  };

  stock: {
    insiders: (symbol: string) => Promise<unknown>;
    recommendations: (symbol: string) => Promise<unknown>;
  };

  claude: {
    analyzeScenario: (scenario: string, context?: string) => Promise<{
      stakeholders: { name: string; position: number; salience: number; power: number; reasoning: string }[];
      analysis: string;
    }>;
    analyzeResult: (scenario: string, result: {
      predictedOutcome: number;
      probability: number;
      confidence: number;
      stakeholderInfluence: { name: string; influence: number }[];
    }) => Promise<string>;
    debate: (scenario: string, stakeholders: { name: string; position: number; salience: number; power: number }[]) => Promise<{
      rounds: { speaker: string; argument: string; movesPosition?: { from: number; to: number } }[];
      conclusion: string;
    }>;
  };
}

interface Window {
  dhando: DhandoApi;
}
