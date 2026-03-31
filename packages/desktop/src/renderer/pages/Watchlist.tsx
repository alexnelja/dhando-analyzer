import React, { useEffect, useState, useCallback } from 'react';
import { DataTable, type Column } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import {
  listWatchlist,
  addWatchlistEntry,
  advanceEntry,
  removeEntry,
  type InvestmentRow,
  type InvestmentStatus,
  type InvestmentType,
  type WatchlistEntry,
} from '../lib/ipc';

const INVESTMENT_TYPES: { value: InvestmentType; label: string }[] = [
  { value: 'listed_stock', label: 'Listed Stock' },
  { value: 'private_equity', label: 'Private Equity' },
  { value: 'property', label: 'Property' },
  { value: 'franchise', label: 'Franchise' },
  { value: 'em_stock', label: 'EM Stock' },
];

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'screening', label: 'Screening' },
  { value: 'researching', label: 'Researching' },
  { value: 'deep_dive', label: 'Deep Dive' },
  { value: 'ready_to_buy', label: 'Ready to Buy' },
  { value: 'held', label: 'Held' },
  { value: 'exited', label: 'Exited' },
  { value: 'rejected', label: 'Rejected' },
];

const EMPTY_FORM: Omit<WatchlistEntry, 'id'> = {
  type: 'listed_stock',
  name: '',
  ticker: '',
  exchange: '',
  sector: '',
  industry: '',
};

export function Watchlist() {
  const [rows, setRows] = useState<InvestmentRow[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listWatchlist(statusFilter ? (statusFilter as InvestmentStatus) : undefined);
      setRows(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleAdd() {
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await addWatchlistEntry({
        ...form,
        ticker: form.ticker || null,
        exchange: form.exchange || null,
        sector: form.sector || null,
        industry: form.industry || null,
      });
      setShowModal(false);
      setForm({ ...EMPTY_FORM });
      await reload();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleAdvance(id: string) {
    try {
      await advanceEntry(id);
      await reload();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this entry from the watchlist?')) return;
    try {
      await removeEntry(id);
      await reload();
    } catch (err) {
      console.error(err);
    }
  }

  const columns: Column<InvestmentRow>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <span className="font-medium text-gray-800">{row.name}</span>
      ),
    },
    {
      key: 'ticker',
      header: 'Ticker',
      render: (row) => (
        <span className="font-mono text-sm text-gray-600">{row.ticker ?? '—'}</span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <span className="text-xs text-gray-500 capitalize">{row.type.replace(/_/g, ' ')}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'sector',
      header: 'Sector',
      render: (row) => (
        <span className="text-xs text-gray-500">{row.sector ?? '—'}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={() => handleAdvance(row.id)}
            className="px-2 py-1 rounded text-xs font-medium transition-colors hover:bg-orange-50"
            style={{ color: '#d97757', border: '1px solid rgba(217,119,87,0.3)' }}
            disabled={['held', 'exited', 'rejected'].includes(row.status)}
          >
            Advance
          </button>
          <button
            onClick={() => handleRemove(row.id)}
            className="px-2 py-1 rounded text-xs font-medium text-red-500 transition-colors hover:bg-red-50"
            style={{ border: '1px solid rgba(224,82,82,0.3)' }}
          >
            Remove
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Watchlist</h1>
          <p className="text-gray-500 mt-1 text-sm">Investment pipeline — track from screening to purchase</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: '#d97757' }}
        >
          + Add Investment
        </button>
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-2 mb-5">
        <span className="text-sm text-gray-500">Filter:</span>
        {STATUS_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              statusFilter === opt.value
                ? 'text-white'
                : 'text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200'
            }`}
            style={
              statusFilter === opt.value
                ? { backgroundColor: '#d97757' }
                : {}
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">Loading...</div>
      ) : (
        <DataTable
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          columns={columns as any}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rows={rows as any}
          keyField="id"
          emptyMessage="No investments in watchlist. Add your first entry above."
        />
      )}

      {/* Add Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setShowModal(false)}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6 mx-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-5">Add Investment</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Berkshire Hathaway"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ticker</label>
                  <input
                    type="text"
                    value={form.ticker ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value }))}
                    placeholder="e.g. BRK.B"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Exchange</label>
                  <input
                    type="text"
                    value={form.exchange ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, exchange: e.target.value }))}
                    placeholder="e.g. NYSE"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as InvestmentType }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                >
                  {INVESTMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Sector</label>
                  <input
                    type="text"
                    value={form.sector ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, sector: e.target.value }))}
                    placeholder="e.g. Financials"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Industry</label>
                  <input
                    type="text"
                    value={form.industry ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                    placeholder="e.g. Insurance"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                  />
                </div>
              </div>
            </div>

            {error && <p className="text-red-500 text-xs mt-3">{error}</p>}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowModal(false); setError(''); }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={saving}
                className="px-4 py-2 text-sm text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: '#d97757' }}
              >
                {saving ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
