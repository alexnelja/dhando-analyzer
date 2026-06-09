import React, { useEffect, useState } from 'react';
import { getApiKeys, setApiKeys, type ApiKeyState } from '../lib/ipc';

/** API keys shown in Settings, with friendly labels + where to get them. */
const KEYS: { name: string; label: string; help: string }[] = [
  { name: 'EODHD_API_KEY', label: 'EODHD', help: 'Fundamentals + prices (eodhd.com)' },
  { name: 'ANTHROPIC_API_KEY', label: 'Anthropic (Claude)', help: 'Statement extraction + stakeholder analysis (console.anthropic.com)' },
  { name: 'FRED_API_KEY', label: 'FRED', help: 'Macro data (fred.stlouisfed.org)' },
  { name: 'FINNHUB_API_KEY', label: 'Finnhub', help: 'Insider trades + recommendations (finnhub.io)' },
];

export function Settings() {
  const [state, setState] = useState<Record<string, ApiKeyState>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getApiKeys()
      .then((keys) => {
        setState(keys);
        setValues(Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, v.value])));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setStatus('Saving…');
    try {
      await setApiKeys(values);
      const refreshed = await getApiKeys();
      setState(refreshed);
      setStatus('Saved. Keys take effect immediately.');
    } catch (err) {
      setStatus(`Save failed: ${String(err)}`);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1 text-sm">
          API keys are stored locally on this machine and never leave it. Each user supplies their
          own — the app ships without any.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200/60 p-6 space-y-5">
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          KEYS.map(({ name, label, help }) => {
            const envFallback = state[name]?.envFallback;
            const hasValue = (values[name] ?? '') !== '';
            return (
              <div key={name}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700">{label}</label>
                  {hasValue ? (
                    <span className="text-xs text-emerald-600">● set</span>
                  ) : envFallback ? (
                    <span className="text-xs text-gray-400">using dev .env fallback</span>
                  ) : (
                    <span className="text-xs text-gray-400">not set</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type={reveal[name] ? 'text' : 'password'}
                    value={values[name] ?? ''}
                    onChange={(e) => setValues((p) => ({ ...p, [name]: e.target.value }))}
                    placeholder={`${label} API key`}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:border-gray-400 focus:outline-none"
                  />
                  <button
                    onClick={() => setReveal((p) => ({ ...p, [name]: !p[name] }))}
                    className="px-3 py-2 text-xs rounded-lg border border-gray-300 hover:bg-gray-50"
                  >
                    {reveal[name] ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">{help}</p>
              </div>
            );
          })
        )}

        <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40"
          >
            Save keys
          </button>
          {status && <span className="text-sm text-gray-600">{status}</span>}
        </div>
      </div>
    </div>
  );
}
