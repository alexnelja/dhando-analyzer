import React, { useEffect, useState, useCallback } from 'react';
import { DataTable, type Column } from '../components/DataTable';
import { listRules, loadRulesFromDir, createRuleEntry, type Rule, type RuleDocumentInput } from '../lib/ipc';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConditionDraft {
  id: string; // local key only
  metric: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'between';
  value: string;
  weight: string;
}

interface RuleFormState {
  name: string;
  category: string;
  type: string;
  sourceType: string;
  sourceDetail: string;
  description: string;
  weight: string;
  conditions: ConditionDraft[];
}

const EMPTY_FORM: RuleFormState = {
  name: '',
  category: 'valuation',
  type: 'scoring',
  sourceType: 'book',
  sourceDetail: '',
  description: '',
  weight: '1.0',
  conditions: [],
};

const EMPTY_CONDITION = (): ConditionDraft => ({
  id: `c-${Date.now()}-${Math.random()}`,
  metric: '',
  operator: 'gt',
  value: '',
  weight: '1',
});

// Path to default rules directory (relative to project root).
// In Electron, resolved via loadRulesFromDir IPC which accepts absolute paths.
const DEFAULT_RULES_DIR = (() => {
  // __dirname is not available in renderer; we resolve via path stored in env or fallback.
  // The preload/main will do the actual FS resolution — we just pass a known relative token.
  return '../../../../../../../rules';
})();

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

export function Rules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadDir, setLoadDir] = useState('');
  const [loadingRules, setLoadingRules] = useState(false);
  const [loadResult, setLoadResult] = useState<{ loaded: number } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null);

  // Generator form state
  const [showGenerator, setShowGenerator] = useState(false);
  const [form, setForm] = useState<RuleFormState>({ ...EMPTY_FORM });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

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
    setLoadError('');
    try {
      const result = await loadRulesFromDir(loadDir.trim());
      setLoadResult(result);
      await reload();
    } catch (err) {
      setLoadError(String(err));
    } finally {
      setLoadingRules(false);
    }
  }

  async function handleLoadDefaults() {
    setLoadingRules(true);
    setLoadResult(null);
    setLoadError('');
    try {
      // Resolve path relative to app root. In packaged electron the app root
      // sits at a well-known location; in dev the cwd is the repo root.
      // We use a sentinel string that the main process can recognise if needed,
      // but here we rely on the fact that loadRulesFromDir accepts any valid path.
      const rulesPath = window.location.protocol === 'file:'
        ? DEFAULT_RULES_DIR
        : '/rules';
      const result = await loadRulesFromDir(rulesPath);
      setLoadResult(result);
      await reload();
    } catch (err) {
      setLoadError(String(err));
    } finally {
      setLoadingRules(false);
    }
  }

  // ── Conditions builder ────────────────────────────────────────────────────

  function addCondition() {
    setForm((f) => ({ ...f, conditions: [...f.conditions, EMPTY_CONDITION()] }));
  }

  function removeCondition(id: string) {
    setForm((f) => ({ ...f, conditions: f.conditions.filter((c) => c.id !== id) }));
  }

  function updateCondition(id: string, field: keyof Omit<ConditionDraft, 'id'>, value: string) {
    setForm((f) => ({
      ...f,
      conditions: f.conditions.map((c) => c.id === id ? { ...c, [field]: value } : c),
    }));
  }

  // ── Create rule ───────────────────────────────────────────────────────────

  async function handleCreateRule() {
    setFormError('');
    if (!form.name.trim()) { setFormError('Name is required'); return; }
    if (!form.sourceDetail.trim()) { setFormError('Source detail is required'); return; }
    if (!form.description.trim()) { setFormError('Description is required'); return; }
    if (form.conditions.length === 0) { setFormError('Add at least one condition'); return; }

    for (const c of form.conditions) {
      if (!c.metric.trim()) { setFormError('All conditions need a metric name'); return; }
      if (!c.value.trim() || isNaN(Number(c.value))) { setFormError('All conditions need a valid numeric value'); return; }
    }

    setSaving(true);
    setSaveSuccess(false);
    try {
      const ruleDoc: RuleDocumentInput = {
        name: form.name.trim(),
        category: form.category,
        type: form.type,
        source_type: form.sourceType,
        source_detail: form.sourceDetail.trim(),
        description: form.description.trim(),
        weight: parseFloat(form.weight) || 1.0,
        conditions: form.conditions.map((c) => ({
          metric: c.metric.trim(),
          operator: c.operator,
          value: c.operator === 'between'
            ? (c.value.split(',').map(Number) as [number, number])
            : Number(c.value),
          weight: parseFloat(c.weight) || 1,
        })),
      };

      await createRuleEntry(ruleDoc);
      setForm({ ...EMPTY_FORM });
      setSaveSuccess(true);
      await reload();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setFormError(String(err));
    } finally {
      setSaving(false);
    }
  }

  // ── Table columns ─────────────────────────────────────────────────────────

  const columns: Column<Rule>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <button
          className="text-left font-medium text-gray-800 hover:underline"
          onClick={() => setSelectedRule(row)}
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Rules Engine</h1>
          <p className="text-gray-500 mt-1 text-sm">Hard gates, scoring rules, and warnings — with believability tracking</p>
        </div>
        <button
          onClick={() => { setShowGenerator((v) => !v); setFormError(''); setSaveSuccess(false); }}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: '#d97757' }}
        >
          {showGenerator ? 'Hide Generator' : '+ Create Rule'}
        </button>
      </div>

      {/* Rule Generator Form */}
      {showGenerator && (
        <div className="bg-white rounded-xl border border-gray-200/60 p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Rule Generator</h3>

          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Name */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. PE ratio must be below 15"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
              >
                {['valuation', 'risk', 'quality', 'behaviour', 'position_sizing', 'distress', 'em_private'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Type */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
              >
                {['hard_gate', 'soft_gate', 'scoring'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Source Type */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Source Type</label>
              <select
                value={form.sourceType}
                onChange={(e) => setForm((f) => ({ ...f, sourceType: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
              >
                {['book', 'meeting', 'mistake', 'expert'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Source Detail */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Source Detail <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.sourceDetail}
                onChange={(e) => setForm((f) => ({ ...f, sourceDetail: e.target.value }))}
                placeholder="e.g. Meeting with John, RE:CM, 2026-04-01"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
              />
            </div>

            {/* Description */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Description <span className="text-red-500">*</span></label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="Explain when this rule fires and why it matters"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 resize-none"
              />
            </div>

            {/* Weight */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Weight</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="10"
                value={form.weight}
                onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
              />
            </div>
          </div>

          {/* Conditions Builder */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">Conditions <span className="text-red-500">*</span></label>
              <button
                type="button"
                onClick={addCondition}
                className="text-xs px-3 py-1 rounded border font-medium transition-colors hover:bg-orange-50"
                style={{ color: '#d97757', borderColor: 'rgba(217,119,87,0.4)' }}
              >
                + Add Condition
              </button>
            </div>

            {form.conditions.length === 0 && (
              <p className="text-xs text-gray-400 py-2">No conditions yet. Click "+ Add Condition" to start.</p>
            )}

            <div className="space-y-2">
              {form.conditions.map((cond) => (
                <div key={cond.id} className="grid grid-cols-12 gap-2 items-center bg-gray-50 rounded-lg p-2">
                  {/* Metric */}
                  <div className="col-span-4">
                    <input
                      type="text"
                      value={cond.metric}
                      onChange={(e) => updateCondition(cond.id, 'metric', e.target.value)}
                      placeholder="metric (e.g. pe)"
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-orange-400 bg-white"
                    />
                  </div>

                  {/* Operator */}
                  <div className="col-span-2">
                    <select
                      value={cond.operator}
                      onChange={(e) => updateCondition(cond.id, 'operator', e.target.value)}
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-orange-400 bg-white"
                    >
                      {['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'between'].map((op) => (
                        <option key={op} value={op}>{op}</option>
                      ))}
                    </select>
                  </div>

                  {/* Value */}
                  <div className="col-span-3">
                    <input
                      type="text"
                      value={cond.value}
                      onChange={(e) => updateCondition(cond.id, 'value', e.target.value)}
                      placeholder={cond.operator === 'between' ? '2,5' : '0'}
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-orange-400 bg-white"
                    />
                  </div>

                  {/* Weight */}
                  <div className="col-span-2">
                    <input
                      type="number"
                      step="0.5"
                      value={cond.weight}
                      onChange={(e) => updateCondition(cond.id, 'weight', e.target.value)}
                      placeholder="wt"
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-orange-400 bg-white"
                    />
                  </div>

                  {/* Remove */}
                  <div className="col-span-1 flex justify-center">
                    <button
                      type="button"
                      onClick={() => removeCondition(cond.id)}
                      className="text-red-400 hover:text-red-600 text-xs font-bold px-1"
                      title="Remove condition"
                    >
                      x
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {form.conditions.some((c) => c.operator === 'between') && (
              <p className="text-xs text-gray-400 mt-1">For "between", enter two comma-separated numbers as the value (e.g. 2,5).</p>
            )}
          </div>

          {formError && <p className="text-red-500 text-xs mb-3">{formError}</p>}
          {saveSuccess && <p className="text-xs mb-3" style={{ color: '#788c5d' }}>Rule created successfully.</p>}

          <div className="flex gap-3">
            <button
              onClick={handleCreateRule}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#d97757' }}
            >
              {saving ? 'Creating...' : 'Create Rule'}
            </button>
            <button
              onClick={() => { setForm({ ...EMPTY_FORM }); setFormError(''); setSaveSuccess(false); }}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:border-gray-300"
            >
              Reset
            </button>
          </div>
        </div>
      )}

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
          <button
            onClick={handleLoadDefaults}
            disabled={loadingRules}
            className="px-4 py-2 text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 border"
            style={{ color: '#6a9bcc', borderColor: 'rgba(106,155,204,0.4)', backgroundColor: 'rgba(106,155,204,0.06)' }}
          >
            Load Default Rules
          </button>
        </div>
        {loadResult && (
          <p className="text-xs mt-2" style={{ color: '#788c5d' }}>
            Successfully loaded {loadResult.loaded} rule{loadResult.loaded !== 1 ? 's' : ''}.
          </p>
        )}
        {loadError && <p className="text-xs mt-2 text-red-500">{loadError}</p>}
        <p className="text-xs text-gray-400 mt-2">
          "Load Default Rules" loads the 19 pre-seeded rules from the <code className="font-mono">rules/</code> directory at the project root.
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
          emptyMessage="No active rules. Use the Rule Generator or load from a YAML directory above."
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
