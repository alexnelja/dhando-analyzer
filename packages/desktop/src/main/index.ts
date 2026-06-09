import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { createDatabase } from '@dhando/core';
import {
  addToWatchlist,
  removeFromWatchlist,
  advancePipelineStatus,
  getWatchlist,
} from '@dhando/core';
import { runScreenerPipeline } from '@dhando/core';
import {
  listActivePositions,
  upsertPosition,
  closePosition,
} from '@dhando/core';
import { computePortfolioSummary } from '@dhando/core';
import { scoreTrafficLight } from '@dhando/core';
import {
  listActiveRules,
  createRule,
} from '@dhando/core';
import { loadRulesFromDirectory } from '@dhando/core';
import { runDistressRadar } from '@dhando/core';
import { analyzePrivateMarket } from '@dhando/core';
import { runDealAnalyzer } from '@dhando/core';
import { createFredClient } from '@dhando/core';
import { createFinnhubClient } from '@dhando/core';
import { createClaudeClient } from '@dhando/core';
import { pullStatements, type Financial } from '@dhando/core';
import { getSetting, setSetting, getAllSettings } from '@dhando/core';
import {
  financialsGet,
  financialsSave,
  financialsPull,
  financialsExtract,
} from './financials-handlers.js';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

const DB_PATH = path.join(app.getPath('userData'), 'dhando.db');
let db: ReturnType<typeof createDatabase> | null = null;

function getDb() {
  if (!db) {
    db = createDatabase(DB_PATH);
  }
  return db;
}

/** The API keys the app understands, surfaced in the Settings page. */
const API_KEY_NAMES = [
  'EODHD_API_KEY',
  'ANTHROPIC_API_KEY',
  'FRED_API_KEY',
  'FINNHUB_API_KEY',
] as const;

/**
 * Resolve an API key: a per-user value saved in Settings (the DB) takes
 * precedence, falling back to the process env (dev convenience). This is what
 * makes the packaged app work for other users — they enter their own keys.
 */
function apiKey(name: (typeof API_KEY_NAMES)[number]): string {
  return getSetting(getDb(), name) ?? process.env[name] ?? '';
}

// Clients are built on demand so a key saved in Settings takes effect without
// an app restart. They are thin fetch wrappers, so per-call construction is cheap.
const getFred = () => createFredClient(apiKey('FRED_API_KEY'));
const getFinnhub = () => createFinnhubClient(apiKey('FINNHUB_API_KEY'));
const getClaude = () => {
  const key = apiKey('ANTHROPIC_API_KEY');
  return key ? createClaudeClient(key) : null;
};
const eodhdFetcher = (ticker: string, years: number) =>
  pullStatements(apiKey('EODHD_API_KEY'), ticker, years);

/** Broadcast a financials-changed event so every window's hook re-fetches. */
function emitFinancialsChanged(investmentId: string) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('dhando:financials:changed', investmentId);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#faf9f5',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5274');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    db?.close();
    app.quit();
  }
});

function registerIpcHandlers() {
  // ── Init ──────────────────────────────────────────────────────────────────
  ipcMain.handle('dhando:init', () => {
    getDb();
    return { ok: true };
  });

  // ── Watchlist ─────────────────────────────────────────────────────────────
  ipcMain.handle('dhando:watchlist:list', (_event, status?: string) => {
    return getWatchlist(getDb(), status ?? undefined);
  });

  ipcMain.handle('dhando:watchlist:add', (_event, data: Parameters<typeof addToWatchlist>[1]) => {
    const newId = addToWatchlist(getDb(), data);

    // Auto-pull EODHD fundamentals in the background so the financials store is
    // populated by the time the user opens the company. Do not await — the
    // handler returns the id immediately so the UI stays responsive.
    const ticker = data?.ticker;
    if (ticker) {
      financialsPull(getDb(), eodhdFetcher, newId, ticker, 2)
        .then(() => emitFinancialsChanged(newId))
        .catch((err: unknown) => {
          console.error('[watchlist:add] EODHD pull failed', {
            ticker,
            err: err instanceof Error ? err.message : String(err),
          });
          // pullAndSave already flags empty results; belt-and-braces on throw.
          getDb().run(
            `UPDATE investments SET needs_manual_financials = 1 WHERE id = ?`,
            newId,
          );
          emitFinancialsChanged(newId);
        });
    }

    return newId;
  });

  ipcMain.handle('dhando:watchlist:advance', (_event, id: string) => {
    advancePipelineStatus(getDb(), id);
    return { ok: true };
  });

  ipcMain.handle('dhando:watchlist:remove', (_event, id: string) => {
    removeFromWatchlist(getDb(), id);
    return { ok: true };
  });

  // ── Screener ──────────────────────────────────────────────────────────────
  ipcMain.handle('dhando:screen', (_event, ...args: Parameters<typeof runScreenerPipeline>) => {
    return runScreenerPipeline(...args);
  });

  // ── Deal Analyzer ─────────────────────────────────────────────────────────
  ipcMain.handle('dhando:analyze', (_event, input: Parameters<typeof runDealAnalyzer>[0]) => {
    return runDealAnalyzer(input);
  });

  // ── Portfolio ─────────────────────────────────────────────────────────────
  ipcMain.handle('dhando:portfolio:list', () => {
    return listActivePositions(getDb());
  });

  ipcMain.handle(
    'dhando:portfolio:upsert',
    (_event, data: Parameters<typeof upsertPosition>[1]) => {
      return upsertPosition(getDb(), data);
    },
  );

  ipcMain.handle(
    'dhando:portfolio:close',
    (_event, investmentId: string, exitPrice: number) => {
      closePosition(getDb(), investmentId, exitPrice);
      return { ok: true };
    },
  );

  ipcMain.handle(
    'dhando:portfolio:dashboard',
    (_event, inputs: Parameters<typeof computePortfolioSummary>[0]) => {
      return computePortfolioSummary(inputs);
    },
  );

  ipcMain.handle(
    'dhando:portfolio:trafficlight',
    (_event, input: Parameters<typeof scoreTrafficLight>[0]) => {
      return scoreTrafficLight(input);
    },
  );

  // ── Rules ─────────────────────────────────────────────────────────────────
  ipcMain.handle('dhando:rules:list', () => {
    return listActiveRules(getDb());
  });

  ipcMain.handle('dhando:rules:load', (_event, dir: string) => {
    const docs = loadRulesFromDirectory(dir);
    const ids: string[] = [];
    for (const doc of docs) {
      const id = createRule(getDb(), doc);
      ids.push(id);
    }
    return { loaded: ids.length, ids };
  });

  ipcMain.handle('dhando:rules:create', (_event, ruleDoc: Parameters<typeof createRule>[1]) => {
    return createRule(getDb(), ruleDoc);
  });

  // ── Distress ──────────────────────────────────────────────────────────────
  ipcMain.handle('dhando:distress:check', (_event, input: Parameters<typeof runDistressRadar>[0]) => {
    return runDistressRadar(input, getDb());
  });

  // ── Financials (shared data store) ────────────────────────────────────────
  ipcMain.handle('dhando:financials:get', (_e, investmentId: string) => {
    return financialsGet(getDb(), investmentId);
  });

  ipcMain.handle('dhando:financials:save', (_e, financial: Financial) => {
    financialsSave(getDb(), financial);
    emitFinancialsChanged(financial.investmentId);
    return { ok: true };
  });

  ipcMain.handle(
    'dhando:financials:pull',
    async (_e, investmentId: string, ticker: string, years = 2) => {
      const saved = await financialsPull(getDb(), eodhdFetcher, investmentId, ticker, years);
      emitFinancialsChanged(investmentId);
      return { saved };
    },
  );

  ipcMain.handle(
    'dhando:financials:extractFromText',
    async (_e, investmentId: string, text: string) => {
      const claude = getClaude();
      if (!claude) throw new Error('Anthropic API key not set — add it in Settings');
      const rows = await financialsExtract(getDb(), claude, investmentId, text);
      emitFinancialsChanged(investmentId);
      return rows;
    },
  );

  // ── Settings (per-user API keys) ──────────────────────────────────────────
  ipcMain.handle('dhando:settings:getKeys', () => {
    const stored = getAllSettings(getDb());
    // Return each key's value (the user's own machine) plus whether the env
    // provides a dev fallback, so the UI can show what's active.
    return Object.fromEntries(
      API_KEY_NAMES.map((name) => [
        name,
        { value: stored[name] ?? '', envFallback: Boolean(process.env[name]) },
      ]),
    );
  });

  ipcMain.handle('dhando:settings:setKeys', (_e, keys: Record<string, string>) => {
    for (const name of API_KEY_NAMES) {
      if (name in keys) setSetting(getDb(), name, keys[name] ?? '');
    }
    return { ok: true };
  });

  // ── Private Markets ───────────────────────────────────────────────────────
  ipcMain.handle(
    'dhando:privatemarkets:analyze',
    (_event, input: Parameters<typeof analyzePrivateMarket>[0]) => {
      return analyzePrivateMarket(input);
    },
  );

  // ── FRED Macro Data ───────────────────────────────────────────────────────
  ipcMain.handle('dhando:macro:vix', () => getFred().getVix());
  ipcMain.handle('dhando:macro:credit-spread', () => getFred().getCreditSpread());
  ipcMain.handle('dhando:macro:yield-curve', () => getFred().getYieldCurve());
  ipcMain.handle('dhando:macro:fed-rate', () => getFred().getFedFundsRate());
  ipcMain.handle('dhando:macro:sentiment', () => getFred().getConsumerSentiment());
  ipcMain.handle('dhando:macro:sa-repo', () => getFred().getSaRepoRate());
  ipcMain.handle('dhando:macro:zar-usd', () => getFred().getZarUsd());

  // ── Finnhub Stock Data ────────────────────────────────────────────────────
  ipcMain.handle('dhando:stock:insiders', (_event, symbol: string) =>
    getFinnhub().getInsiderTransactions(symbol),
  );
  ipcMain.handle('dhando:stock:recommendations', (_event, symbol: string) =>
    getFinnhub().getRecommendations(symbol),
  );

  // ── Claude AI ─────────────────────────────────────────────────────────────
  ipcMain.handle('dhando:claude:analyze-scenario', async (_e, scenario: string, context?: string) => {
    const claude = getClaude();
    if (!claude) throw new Error('Anthropic API key not set — add it in Settings');
    return claude.analyzeScenario(scenario, context);
  });

  ipcMain.handle('dhando:claude:analyze-result', async (
    _e,
    scenario: string,
    result: { predictedOutcome: number; probability: number; confidence: number; stakeholderInfluence: { name: string; influence: number }[] },
  ) => {
    const claude = getClaude();
    if (!claude) throw new Error('Anthropic API key not set — add it in Settings');
    return claude.analyzeResult(scenario, result);
  });

  ipcMain.handle('dhando:claude:debate', async (
    _e,
    scenario: string,
    stakeholders: { name: string; position: number; salience: number; power: number }[],
  ) => {
    const claude = getClaude();
    if (!claude) throw new Error('Anthropic API key not set — add it in Settings');
    return claude.debate(scenario, stakeholders);
  });
}
