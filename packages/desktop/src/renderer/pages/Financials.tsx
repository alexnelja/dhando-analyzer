import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  listWatchlist,
  saveFinancials,
  pullFinancials,
  extractFinancialsFromText,
  type InvestmentRow,
  type Financial,
} from '../lib/ipc';
import { useFinancials } from '../hooks/useFinancials';

/** Editable numeric fields grouped by statement, in display order. */
const FIELD_GROUPS: { title: string; fields: { key: keyof Financial; label: string }[] }[] = [
  {
    title: 'Income Statement',
    fields: [
      { key: 'revenue', label: 'Revenue' },
      { key: 'grossProfit', label: 'Gross Profit' },
      { key: 'ebitda', label: 'EBITDA' },
      { key: 'ebit', label: 'EBIT' },
      { key: 'netIncome', label: 'Net Income' },
      { key: 'sga', label: 'SG&A' },
    ],
  },
  {
    title: 'Balance Sheet',
    fields: [
      { key: 'totalAssets', label: 'Total Assets' },
      { key: 'currentAssets', label: 'Current Assets' },
      { key: 'totalLiabilities', label: 'Total Liabilities' },
      { key: 'currentLiabilities', label: 'Current Liabilities' },
      { key: 'longTermDebt', label: 'Long-Term Debt' },
      { key: 'totalDebt', label: 'Total Debt' },
      { key: 'retainedEarnings', label: 'Retained Earnings' },
      { key: 'ppe', label: 'PP&E' },
      { key: 'receivables', label: 'Receivables' },
      { key: 'cash', label: 'Cash' },
      { key: 'workingCapital', label: 'Working Capital' },
      { key: 'sharesOutstanding', label: 'Shares Outstanding' },
    ],
  },
  {
    title: 'Cash Flow',
    fields: [
      { key: 'cashFromOps', label: 'Cash From Ops' },
      { key: 'capex', label: 'CapEx' },
      { key: 'fcf', label: 'Free Cash Flow' },
      { key: 'depreciation', label: 'Depreciation' },
    ],
  },
];

type Edits = Record<number, Partial<Record<keyof Financial, number | null>>>;

export function Financials() {
  const { investmentId } = useParams<{ investmentId?: string }>();
  const [investments, setInvestments] = useState<InvestmentRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>(investmentId ?? '');
  const [edits, setEdits] = useState<Edits>({});
  const [busy, setBusy] = useState<'' | 'pull' | 'save' | 'extract'>('');
  const [message, setMessage] = useState<string>('');
  const [showExtract, setShowExtract] = useState(false);
  const [extractText, setExtractText] = useState('');

  const fin = useFinancials(selectedId || null);

  useEffect(() => {
    listWatchlist().then(setInvestments).catch(console.error);
  }, []);

  useEffect(() => {
    if (investmentId) setSelectedId(investmentId);
  }, [investmentId]);

  // Clear pending edits whenever the underlying rows change (e.g. after save/pull).
  useEffect(() => {
    setEdits({});
  }, [fin.rows]);

  const selected = investments.find((i) => i.id === selectedId);
  const years = useMemo(() => fin.rows.map((r) => r.year), [fin.rows]);
  const rowByYear = useMemo(() => {
    const m = new Map<number, Financial>();
    for (const r of fin.rows) m.set(r.year, r);
    return m;
  }, [fin.rows]);

  function cellValue(year: number, key: keyof Financial): number | null {
    const edit = edits[year];
    if (edit && key in edit) return edit[key] ?? null;
    return (rowByYear.get(year)?.[key] as number | null) ?? null;
  }

  function apiValue(year: number, key: keyof Financial): number | null {
    const json = rowByYear.get(year)?.apiValuesJson;
    if (!json) return null;
    try {
      return (JSON.parse(json) as Record<string, number | null>)[key] ?? null;
    } catch {
      return null;
    }
  }

  /** A field diverges from its API snapshot → show a reconciliation dot. */
  function diverges(year: number, key: keyof Financial): boolean {
    const api = apiValue(year, key);
    if (api === null) return false;
    return cellValue(year, key) !== api;
  }

  function onEdit(year: number, key: keyof Financial, raw: string) {
    const value = raw.trim() === '' ? null : Number(raw);
    setEdits((prev) => ({ ...prev, [year]: { ...prev[year], [key]: value } }));
  }

  async function handleSave() {
    setBusy('save');
    setMessage('');
    try {
      for (const yearStr of Object.keys(edits)) {
        const year = Number(yearStr);
        const base = rowByYear.get(year);
        if (!base) continue;
        const changedKeys = Object.keys(edits[year]) as (keyof Financial)[];
        const priorOverrides: string[] = base.overriddenFields
          ? (JSON.parse(base.overriddenFields) as string[])
          : [];
        const overriddenFields = Array.from(new Set([...priorOverrides, ...changedKeys]));
        // edits only ever holds numeric statement fields, so the merge is a
        // valid Financial; assert to collapse the widened index-signature type.
        const updated = {
          ...base,
          ...edits[year],
          source: 'manual',
          overriddenFields: JSON.stringify(overriddenFields),
        } as Financial;
        await saveFinancials(updated);
      }
      setMessage('Saved.');
    } catch (err) {
      setMessage(`Save failed: ${String(err)}`);
    } finally {
      setBusy('');
    }
  }

  async function handleRepull() {
    if (!selected?.ticker) {
      setMessage('No ticker on this investment to pull from EODHD.');
      return;
    }
    setBusy('pull');
    setMessage('');
    try {
      const { saved } = await pullFinancials(selectedId, selected.ticker, 2);
      setMessage(saved > 0 ? `Pulled ${saved} period(s) from EODHD.` : 'EODHD returned no data — enter manually.');
    } catch (err) {
      setMessage(`Pull failed: ${String(err)}`);
    } finally {
      setBusy('');
    }
  }

  async function handleExtract() {
    setBusy('extract');
    setMessage('');
    try {
      const rows = await extractFinancialsFromText(selectedId, extractText);
      setMessage(`Extracted ${rows.length} period(s).`);
      setShowExtract(false);
      setExtractText('');
    } catch (err) {
      setMessage(`Extract failed: ${String(err)}`);
    } finally {
      setBusy('');
    }
  }

  const hasEdits = Object.keys(edits).length > 0;

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Financials</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Single source of truth for each company's statements. Edited cells override the API
          snapshot and are flagged for reconciliation.
        </p>
      </div>

      {/* Selector + actions */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-6 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-64"
          >
            <option value="">Select an investment…</option>
            {investments.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.name}
                {inv.ticker ? ` (${inv.ticker})` : ''}
              </option>
            ))}
          </select>

          <div className="flex-1" />

          <button
            onClick={handleRepull}
            disabled={!selectedId || busy !== ''}
            className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white disabled:opacity-40 hover:bg-gray-700"
          >
            {busy === 'pull' ? 'Pulling…' : 'Re-pull from EODHD'}
          </button>
          <button
            onClick={() => setShowExtract(true)}
            disabled={!selectedId || busy !== ''}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
          >
            Extract from text…
          </button>
        </div>

        {message && <p className="mt-3 text-sm text-gray-600">{message}</p>}
      </div>

      {/* Status banner */}
      {selectedId && (
        <StatusBanner status={fin.status} missingFields={fin.missingFields} />
      )}

      {/* Grid */}
      {selectedId && fin.rows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="text-left font-medium px-4 py-3">Field</th>
                {years.map((y) => (
                  <th key={y} className="text-right font-medium px-4 py-3">
                    {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FIELD_GROUPS.map((group) => (
                <React.Fragment key={group.title}>
                  <tr className="bg-gray-50/60">
                    <td
                      colSpan={years.length + 1}
                      className="px-4 py-2 text-xs uppercase tracking-wide text-gray-400 font-medium"
                    >
                      {group.title}
                    </td>
                  </tr>
                  {group.fields.map((field) => (
                    <tr key={field.key} className="border-t border-gray-100">
                      <td className="px-4 py-2 text-gray-700">{field.label}</td>
                      {years.map((y) => (
                        <td key={y} className="px-4 py-2">
                          <div className="flex items-center justify-end gap-1.5">
                            {diverges(y, field.key) && (
                              <span
                                title={`Overridden — API value: ${apiValue(y, field.key) ?? 'n/a'}`}
                                className="w-2 h-2 rounded-full bg-amber-400 shrink-0"
                              />
                            )}
                            <input
                              type="number"
                              value={cellValue(y, field.key) ?? ''}
                              onChange={(e) => onEdit(y, field.key, e.target.value)}
                              className="w-32 text-right border border-gray-200 rounded px-2 py-1 focus:border-gray-400 focus:outline-none"
                            />
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>

          <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50/40">
            {hasEdits && <span className="text-xs text-amber-600">Unsaved changes</span>}
            <button
              onClick={handleSave}
              disabled={!hasEdits || busy !== ''}
              className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white disabled:opacity-40 hover:bg-emerald-500"
            >
              {busy === 'save' ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      {selectedId && fin.rows.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200/60 p-8 text-center text-gray-500 text-sm">
          No financials stored yet. Use <strong>Re-pull from EODHD</strong> or{' '}
          <strong>Extract from text…</strong> to populate.
        </div>
      )}

      {/* Extract modal */}
      {showExtract && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-[640px] max-w-[90vw] shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Extract financials from text</h2>
            <p className="text-sm text-gray-500 mb-3">
              Paste an income statement / balance sheet. Claude will structure it into year columns.
            </p>
            <textarea
              value={extractText}
              onChange={(e) => setExtractText(e.target.value)}
              rows={12}
              className="w-full border border-gray-300 rounded-lg p-3 text-sm font-mono focus:border-gray-400 focus:outline-none"
              placeholder="Revenue 2025: 1,000 …"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setShowExtract(false)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleExtract}
                disabled={extractText.trim() === '' || busy !== ''}
                className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white disabled:opacity-40 hover:bg-gray-700"
              >
                {busy === 'extract' ? 'Extracting…' : 'Extract'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBanner({
  status,
  missingFields,
}: {
  status: 'missing' | 'incomplete' | 'loaded';
  missingFields: string[];
}) {
  if (status === 'loaded') {
    return (
      <div className="mb-6 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
        ✓ All distress scores can be computed from the stored data.
      </div>
    );
  }
  if (status === 'incomplete') {
    return (
      <div className="mb-6 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
        Incomplete — missing: {missingFields.join(', ')}
      </div>
    );
  }
  return (
    <div className="mb-6 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-600">
      No financial data yet for this investment.
    </div>
  );
}
