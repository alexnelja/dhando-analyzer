import React, { useEffect, useState, useCallback } from 'react';
import { DataTable, type Column } from '../components/DataTable';
import { listRules, loadRulesFromDir, type Rule } from '../lib/ipc';

export function Rules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadDir, setLoadDir] = useState('');
  const [loadingRules, setLoadingRules] = useState(false);
  const [loadResult, setLoadResult] = useState<{ loaded: number } | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listRules();
      setRules(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleLoadRules() {
    if (!loadDir.trim()) return;
    setLoadingRules(true);
    setLoadResult(null);
    try {
      const result = await loadRulesFromDir(loadDir.trim());
      setLoadResult(result);
      await reload();
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRules(false);
    }
  }

  const categoryColor = (cat: string) => {
    switch (cat) {
      case 'quality': return '#788c5d';
      case 'valuation': return '#6a9bcc';
      case 'risk': return '#e05252';
      default: return '#b0aea5';
    }
  };

  const typeColor = (type: string) => {
    if (type === 'hard_gate') return '#e05252';
    if (type === 'scoring') return '#6a9bcc';
    return '#d97757';
  };

  const columns: Column<Rule>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <button
          className="text-left font-medium text-gray-800 hover:underline"
          onClick={() => setSelectedRule(row)}
          style={{ cursor: 'pointer' }}
        >
          {row.name}
        </button>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => (
        <span
          className="inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize"
          style={{
            backgroundColor: `${categoryColor(row.category)}18`,
            color: categoryColor(row.category),
            border: `1px solid ${categoryColor(row.category)}40`,
          }}
        >
          {row.category}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <span
          className="inline-block px-2 py-0.5 rounded text-xs font-mono"
          style={{
            backgroundColor: `${typeColor(row.type)}10`,
            color: typeColor(row.type),
          }}
        >
          {row.type}
        </span>
      ),
    },
    {
      key: 'believabilityScore',
      header: 'Believability',
      align: 'right',
      render: (row) => (
        <div className="flex items-center gap-2 justify-end">
          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${row.believabilityScore * 100}%`,
                backgroundColor: row.believabilityScore >= 0.7 ? '#788c5d' : '#d97757',
              }}
            />
          </div>
          <span className="text-xs text-gray-500">{(row.believabilityScore * 100).toFixed(0)}%</span>
        </div>
      ),
    },
    {
      key: 'timesFired',
      header: 'Fired',
      align: 'right',
      render: (row) => <span className="text-sm text-gray-600">{row.timesFired}</span>,
    },
    {
      key: 'weight',
      header: 'Weight',
      align: 'right',
      render: (row) => <span className="text-sm text-gray-600">{row.weight.toFixed(2)}</span>,
    },
  ];

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Rules Engine</h1>
          <p className="text-gray-500 mt-1 text-sm">Hard gates, scoring rules, and warnings — with believability tracking</p>
        </div>
      </div>

      {/* Load rules from directory */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Load Rules from YAML</h3>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={loadDir}
            onChange={(e) => setLoadDir(e.target.value)}
            placeholder="/path/to/rules/directory"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
          />
          <button
            onClick={handleLoadRules}
            disabled={loadingRules || !loadDir.trim()}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#d97757' }}
          >
            {loadingRules ? 'Loading...' : 'Load Rules'}
          </button>
        </div>
        {loadResult && (
          <p className="text-xs mt-2" style={{ color: '#788c5d' }}>
            Successfully loaded {loadResult.loaded} rule{loadResult.loaded !== 1 ? 's' : ''}.
          </p>
        )}
        <p className="text-xs text-gray-400 mt-2">
          Defaults to <code className="font-mono">{String(window?.location?.origin ?? '')}/rules</code> from the project root.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200/60 p-4 text-center">
          <p className="text-2xl font-bold text-gray-800">{rules.length}</p>
          <p className="text-xs text-gray-500 mt-1">Active Rules</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200/60 p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: '#e05252' }}>
            {rules.filter((r) => r.type === 'hard_gate').length}
          </p>
          <p className="text-xs text-gray-500 mt-1">Hard Gates</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200/60 p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: '#6a9bcc' }}>
            {rules.filter((r) => r.type === 'scoring').length}
          </p>
          <p className="text-xs text-gray-500 mt-1">Scoring</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200/60 p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: '#d97757' }}>
            {rules.reduce((sum, r) => sum + r.timesFired, 0)}
          </p>
          <p className="text-xs text-gray-500 mt-1">Total Fired</p>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">Loading...</div>
      ) : (
        <DataTable
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          columns={columns as any}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rows={rules as any}
          keyField="id"
          emptyMessage="No active rules. Load rules from a YAML directory above."
        />
      )}

      {/* Rule detail modal */}
      {selectedRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setSelectedRule(null)}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg p-6 mx-4 max-h-[80vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">{selectedRule.name}</h2>
            <p className="text-sm text-gray-500 mb-5">{selectedRule.description}</p>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-500">Category</span>
                <span className="font-medium capitalize">{selectedRule.category}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-500">Type</span>
                <span className="font-mono text-xs">{selectedRule.type}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-500">Source</span>
                <span>{selectedRule.sourceType} — {selectedRule.sourceDetail}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-500">Weight</span>
                <span>{selectedRule.weight}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-500">Believability</span>
                <span>{(selectedRule.believabilityScore * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-500">Times Fired</span>
                <span>{selectedRule.timesFired}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-500">Times Correct</span>
                <span>{selectedRule.timesCorrect}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-500">Version</span>
                <span>v{selectedRule.version}</span>
              </div>
            </div>

            <div className="mt-5">
              <p className="text-xs font-medium text-gray-500 mb-2">Conditions</p>
              <pre className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 overflow-auto max-h-40">
                {JSON.stringify(selectedRule.conditions, null, 2)}
              </pre>
            </div>

            <button
              onClick={() => setSelectedRule(null)}
              className="mt-5 w-full py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:border-gray-300"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
