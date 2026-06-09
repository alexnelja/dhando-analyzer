import { contextBridge, ipcRenderer } from 'electron';

/**
 * Typed IPC bridge exposed as window.dhando in the renderer process.
 * All communication passes through contextBridge for security.
 */
contextBridge.exposeInMainWorld('dhando', {
  init: () => ipcRenderer.invoke('dhando:init'),

  watchlist: {
    list: (status?: string) => ipcRenderer.invoke('dhando:watchlist:list', status),
    add: (data: unknown) => ipcRenderer.invoke('dhando:watchlist:add', data),
    advance: (id: string) => ipcRenderer.invoke('dhando:watchlist:advance', id),
    remove: (id: string) => ipcRenderer.invoke('dhando:watchlist:remove', id),
  },

  screen: (...args: unknown[]) => ipcRenderer.invoke('dhando:screen', ...args),

  analyze: (input: unknown) => ipcRenderer.invoke('dhando:analyze', input),

  portfolio: {
    list: () => ipcRenderer.invoke('dhando:portfolio:list'),
    upsert: (data: unknown) => ipcRenderer.invoke('dhando:portfolio:upsert', data),
    close: (investmentId: string, exitPrice: number) =>
      ipcRenderer.invoke('dhando:portfolio:close', investmentId, exitPrice),
    dashboard: (inputs: unknown) => ipcRenderer.invoke('dhando:portfolio:dashboard', inputs),
    trafficLight: (input: unknown) => ipcRenderer.invoke('dhando:portfolio:trafficlight', input),
  },

  rules: {
    list: () => ipcRenderer.invoke('dhando:rules:list'),
    load: (dir: string) => ipcRenderer.invoke('dhando:rules:load', dir),
    create: (rule: unknown) => ipcRenderer.invoke('dhando:rules:create', rule),
  },

  distress: {
    check: (input: unknown) => ipcRenderer.invoke('dhando:distress:check', input),
  },

  financials: {
    get: (investmentId: string) => ipcRenderer.invoke('dhando:financials:get', investmentId),
    save: (financial: unknown) => ipcRenderer.invoke('dhando:financials:save', financial),
    pull: (investmentId: string, ticker: string, years = 2) =>
      ipcRenderer.invoke('dhando:financials:pull', investmentId, ticker, years),
    extractFromText: (investmentId: string, text: string) =>
      ipcRenderer.invoke('dhando:financials:extractFromText', investmentId, text),
    /** Subscribe to financials-changed broadcasts. Returns an unsubscribe fn. */
    onChanged: (cb: (investmentId: string) => void) => {
      const handler = (_e: unknown, investmentId: string) => cb(investmentId);
      ipcRenderer.on('dhando:financials:changed', handler);
      return () => ipcRenderer.removeListener('dhando:financials:changed', handler);
    },
  },

  privateMarkets: {
    analyze: (input: unknown) => ipcRenderer.invoke('dhando:privatemarkets:analyze', input),
  },

  macro: {
    vix: () => ipcRenderer.invoke('dhando:macro:vix'),
    creditSpread: () => ipcRenderer.invoke('dhando:macro:credit-spread'),
    yieldCurve: () => ipcRenderer.invoke('dhando:macro:yield-curve'),
    fedRate: () => ipcRenderer.invoke('dhando:macro:fed-rate'),
    sentiment: () => ipcRenderer.invoke('dhando:macro:sentiment'),
    saRepo: () => ipcRenderer.invoke('dhando:macro:sa-repo'),
    zarUsd: () => ipcRenderer.invoke('dhando:macro:zar-usd'),
  },

  stock: {
    insiders: (symbol: string) => ipcRenderer.invoke('dhando:stock:insiders', symbol),
    recommendations: (symbol: string) => ipcRenderer.invoke('dhando:stock:recommendations', symbol),
  },

  claude: {
    analyzeScenario: (scenario: string, context?: string) =>
      ipcRenderer.invoke('dhando:claude:analyze-scenario', scenario, context),
    analyzeResult: (scenario: string, result: unknown) =>
      ipcRenderer.invoke('dhando:claude:analyze-result', scenario, result),
    debate: (scenario: string, stakeholders: unknown) =>
      ipcRenderer.invoke('dhando:claude:debate', scenario, stakeholders),
  },
});
