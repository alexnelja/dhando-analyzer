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
  };

  distress: {
    check: (input: unknown) => Promise<unknown>;
  };

  privateMarkets: {
    analyze: (input: unknown) => Promise<unknown>;
  };
}

interface Window {
  dhando: DhandoApi;
}
