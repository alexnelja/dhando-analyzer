import React, { useEffect, useState, useCallback, useRef } from 'react';
import { formatCurrency } from '../lib/currency';
import { DataTable, type Column } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import {
  listWatchlist,
  addWatchlistEntry,
  advanceEntry,
  removeEntry,
  searchStocks,
  getStockProfile,
  getStockPrice,
  addPosition,
  setInvestmentStatus,
  type InvestmentRow,
  type InvestmentStatus,
  type InvestmentType,
  type WatchlistEntry,
  type StockSearchResult,
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
  notes: '',
};

interface PortfolioModalState {
  open: boolean;
  investmentId: string;
  investmentName: string;
  entryPrice: string;
  shares: string;
  saving: boolean;
  error: string;
  success: boolean;
}

const EMPTY_PORTFOLIO_MODAL: PortfolioModalState = {
  open: false,
  investmentId: '',
  investmentName: '',
  entryPrice: '',
  shares: '',
  saving: false,
  error: '',
  success: false,
};

function StatusDropdown({
  currentStatus,
  onStatusChange,
}: {
  currentStatus: InvestmentStatus;
  onStatusChange: (s: InvestmentStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const statuses: InvestmentStatus[] = [
    'screening',
    'researching',
    'deep_dive',
    'ready_to_buy',
    'held',
    'exited',
    'rejected',
  ];

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="cursor-pointer">
        <StatusBadge status={currentStatus} />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => {
                onStatusChange(s);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs capitalize hover:bg-gray-50 ${
                s === currentStatus ? 'font-semibold text-orange-600' : 'text-gray-600'
              }`}
            >
              {s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Watchlist() {
  const [rows, setRows] = useState<InvestmentRow[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Stock search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Portfolio modal state
  const [portfolioModal, setPortfolioModal] = useState<PortfolioModalState>({ ...EMPTY_PORTFOLIO_MODAL });

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

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced stock search
  function handleSearchInput(value: string) {
    setSearchQuery(value);
    setForm((f) => ({ ...f, name: value }));
    setLivePrice(null);

    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (value.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    setSearching(true);
    searchTimeout.current = setTimeout(async () => {
      const results = await searchStocks(value);
      setSearchResults(results);
      setShowDropdown(results.length > 0);
      setSearching(false);
    }, 300);
  }

  // Select a stock from search results
  async function handleSelectStock(stock: StockSearchResult) {
    setForm((f) => ({
      ...f,
      name: stock.Name,
      ticker: stock.Code,
      exchange: stock.Exchange,
      type: 'listed_stock',
    }));
    setSearchQuery(stock.Name);
    setShowDropdown(false);
    setSearchResults([]);

    // Fetch sector/industry and live price
    setLoadingProfile(true);
    setLivePrice(null);

    const [profile, price] = await Promise.all([
      getStockProfile(stock.Code, stock.Exchange),
      getStockPrice(stock.Code, stock.Exchange),
    ]);

    if (profile) {
      setForm((f) => ({
        ...f,
        sector: profile.sector || f.sector,
        industry: profile.industry || f.industry,
      }));
    }

    if (price !== null) {
      setLivePrice(price);
    }

    setLoadingProfile(false);
  }

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
      setSearchQuery('');
      setLivePrice(null);
      await reload();
    } catch (err) {
      console.error('[Watchlist] addWatchlistEntry failed:', err);
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
      console.error('[Watchlist] advanceEntry failed:', err);
    }
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this entry from the watchlist?')) return;
    try {
      await removeEntry(id);
      await reload();
    } catch (err) {
      console.error('[Watchlist] removeEntry failed:', err);
    }
  }

  async function handleStatusChange(id: string, newStatus: InvestmentStatus) {
    try {
      await setInvestmentStatus(id, newStatus);
      await reload();
    } catch (err) {
      console.error('[Watchlist] setInvestmentStatus failed:', err);
    }
  }

  function openModal() {
    setForm({ ...EMPTY_FORM });
    setSearchQuery('');
    setSearchResults([]);
    setShowDropdown(false);
    setLivePrice(null);
    setError('');
    setShowModal(true);
  }

  // Open "Add to Portfolio" modal for a row
  async function openPortfolioModal(row: InvestmentRow) {
    const livePriceForRow = row.ticker && row.exchange
      ? await getStockPrice(row.ticker, row.exchange).catch(() => null)
      : null;

    setPortfolioModal({
      open: true,
      investmentId: row.id,
      investmentName: row.name,
      entryPrice: livePriceForRow !== null ? String(livePriceForRow) : '',
      shares: '',
      saving: false,
      error: '',
      success: false,
    });
  }

  async function handleConfirmPortfolioAdd() {
    const { investmentId, entryPrice, shares } = portfolioModal;
    const cost = parseFloat(entryPrice);
    const qty = parseFloat(shares);

    if (!cost || cost <= 0) {
      setPortfolioModal((m) => ({ ...m, error: 'Entry price must be a positive number' }));
      return;
    }
    if (!qty || qty <= 0) {
      setPortfolioModal((m) => ({ ...m, error: 'Number of shares must be a positive number' }));
      return;
    }

    setPortfolioModal((m) => ({ ...m, saving: true, error: '' }));
    try {
      await addPosition(investmentId, cost, qty);
      setPortfolioModal((m) => ({ ...m, saving: false, success: true }));
      setTimeout(() => setPortfolioModal({ ...EMPTY_PORTFOLIO_MODAL }), 1500);
    } catch (err) {
      setPortfolioModal((m) => ({ ...m, saving: false, error: String(err) }));
    }
  }

  const columns: Column<InvestmentRow>[] = [
    {
      key: 'expand',
      header: '',
      render: (row) => (
        <button
          onClick={() => setExpandedRowId(expandedRowId === row.id ? null : row.id)}
          className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-transform"
          style={{ transform: expandedRowId === row.id ? 'rotate(90deg)' : 'rotate(0deg)' }}
          title="View thesis and scores"
        >
          &#9654;
        </button>
      ),
    },
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
        <span className="font-mono text-sm text-gray-600">{row.ticker ?? '\u2014'}</span>
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
      render: (row) => (
        <StatusDropdown
          currentStatus={row.status}
          onStatusChange={(newStatus) => handleStatusChange(row.id, newStatus)}
        />
      ),
    },
    {
      key: 'sector',
      header: 'Sector',
      render: (row) => (
        <span className="text-xs text-gray-500">{row.sector ?? '\u2014'}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex items-center gap-2 justify-end">
          {(row.status === 'ready_to_buy' || row.status === 'held') && (
            <button
              onClick={() => openPortfolioModal(row)}
              className="px-2 py-1 rounded text-xs font-medium transition-colors hover:bg-green-50"
              style={{ color: '#788c5d', border: '1px solid rgba(120,140,93,0.3)' }}
            >
              + Portfolio
            </button>
          )}
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
          onClick={openModal}
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
            style={statusFilter === opt.value ? { backgroundColor: '#d97757' } : {}}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-gray-400 text-sm italic px-4 py-8 text-center border border-gray-200/60 rounded-lg">
          No investments in watchlist. Add your first entry above.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200/60" style={{ backgroundColor: '#f3f2ee' }}>
                <th className="px-4 py-3 w-8" />
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Ticker</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Sector</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100/60">
              {rows.map((row) => (
                <React.Fragment key={row.id}>
                  <tr className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setExpandedRowId(expandedRowId === row.id ? null : row.id)}
                        className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-transform duration-150"
                        style={{ transform: expandedRowId === row.id ? 'rotate(90deg)' : 'rotate(0deg)' }}
                        title="View thesis and scores"
                      >
                        &#9654;
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-medium">{row.name}</td>
                    <td className="px-4 py-3 text-gray-700">
                      <span className="font-mono text-sm text-gray-600">{row.ticker ?? '\u2014'}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <span className="text-xs text-gray-500 capitalize">{row.type.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <StatusDropdown
                        currentStatus={row.status}
                        onStatusChange={(newStatus) => handleStatusChange(row.id, newStatus)}
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <span className="text-xs text-gray-500">{row.sector ?? '\u2014'}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        {(row.status === 'ready_to_buy' || row.status === 'held') && (
                          <button
                            onClick={() => openPortfolioModal(row)}
                            className="px-2 py-1 rounded text-xs font-medium transition-colors hover:bg-green-50"
                            style={{ color: '#788c5d', border: '1px solid rgba(120,140,93,0.3)' }}
                          >
                            + Portfolio
                          </button>
                        )}
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
                    </td>
                  </tr>
                  {expandedRowId === row.id && (
                    <tr>
                      <td colSpan={7} className="px-4 py-4 bg-gray-50/80 border-t border-gray-100">
                        <div className="max-w-2xl space-y-3">
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Investment Thesis</p>
                            {row.notes ? (
                              <p className="text-sm text-gray-700 leading-relaxed">{row.notes}</p>
                            ) : (
                              <p className="text-xs text-gray-400 italic">No thesis captured. Edit the investment to add one.</p>
                            )}
                          </div>
                          {(row.moat_score !== null || row.management_score !== null || row.circle_of_competence_fit !== null || row.intrinsic_value !== null) && (
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Stored Scores</p>
                              <div className="flex flex-wrap gap-3">
                                {row.moat_score !== null && (
                                  <div className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs">
                                    <span className="text-gray-500">Moat: </span>
                                    <span className="font-semibold text-gray-800">{row.moat_score}/10</span>
                                  </div>
                                )}
                                {row.management_score !== null && (
                                  <div className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs">
                                    <span className="text-gray-500">Management: </span>
                                    <span className="font-semibold text-gray-800">{row.management_score}/10</span>
                                  </div>
                                )}
                                {row.circle_of_competence_fit !== null && (
                                  <div className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs">
                                    <span className="text-gray-500">Composite Score: </span>
                                    <span className="font-semibold text-gray-800">{row.circle_of_competence_fit}/100</span>
                                  </div>
                                )}
                                {row.intrinsic_value !== null && (
                                  <div className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs">
                                    <span className="text-gray-500">Intrinsic Value: </span>
                                    <span className="font-semibold text-gray-800">R {row.intrinsic_value.toFixed(2)}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Investment Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6 mx-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-5">Add Investment</h2>

            <div className="space-y-4">
              {/* Search input with autocomplete */}
              <div ref={dropdownRef} className="relative">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Search Stock <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchInput(e.target.value)}
                    placeholder="Type company name or ticker (e.g. Capitec, BRK.B)"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                    autoFocus
                  />
                  {searching && (
                    <div className="absolute right-3 top-2.5">
                      <div className="w-4 h-4 border-2 border-orange-300 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>

                {/* Search results dropdown */}
                {showDropdown && searchResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200 max-h-64 overflow-y-auto">
                    {searchResults.map((stock, i) => {
                      const isJse = ['JSE', 'JO', 'XJSE'].includes(stock.Exchange);
                      const displayPrice = stock.previousClose
                        ? isJse ? stock.previousClose / 100 : stock.previousClose
                        : null;
                      return (
                        <button
                          key={`${stock.Code}-${stock.Exchange}-${i}`}
                          onClick={() => handleSelectStock(stock)}
                          className="w-full text-left px-3 py-2.5 hover:bg-orange-50 transition-colors border-b border-gray-50 last:border-0"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900 text-sm">{stock.Name}</span>
                                {isJse && (
                                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-semibold rounded">JSE</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="font-mono text-xs text-orange-600 font-semibold">{stock.Code}</span>
                                <span className="text-xs text-gray-400">{stock.Exchange}</span>
                                <span className="text-xs text-gray-400">{stock.Country}</span>
                                {displayPrice !== null && (
                                  <span className="text-xs font-medium text-green-600">
                                    {isJse ? `R ${displayPrice.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : `${stock.Currency} ${displayPrice.toFixed(2)}`}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="text-xs text-gray-400 capitalize">{stock.Type}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Live price badge */}
              {livePrice !== null && (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg border border-green-200">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-sm font-medium text-green-700">
                    Live Price: {formatCurrency(livePrice)}
                  </span>
                </div>
              )}

              {loadingProfile && (
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="w-4 h-4 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-blue-600">Fetching stock details...</span>
                </div>
              )}

              {/* Auto-filled fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ticker</label>
                  <input
                    type="text"
                    value={form.ticker ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value }))}
                    placeholder="Auto-filled"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Exchange</label>
                  <input
                    type="text"
                    value={form.exchange ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, exchange: e.target.value }))}
                    placeholder="Auto-filled"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 bg-gray-50"
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
                    <option key={t.value} value={t.value}>{t.label}</option>
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
                    placeholder="Auto-filled"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Industry</label>
                  <input
                    type="text"
                    value={form.industry ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                    placeholder="Auto-filled"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 bg-gray-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Investment Thesis (optional)</label>
                <textarea
                  value={form.notes ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Why is this a good investment? What's your thesis?"
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 resize-none"
                />
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
                disabled={saving || !form.name.trim()}
                className="px-4 py-2 text-sm text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: '#d97757' }}
              >
                {saving ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add to Portfolio Modal */}
      {portfolioModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setPortfolioModal({ ...EMPTY_PORTFOLIO_MODAL })}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6 mx-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Add to Portfolio</h2>
            <p className="text-sm text-gray-500 mb-5">{portfolioModal.investmentName}</p>

            {portfolioModal.success ? (
              <div className="py-4 text-center">
                <p className="text-sm font-medium" style={{ color: '#788c5d' }}>Position added successfully.</p>
              </div>
            ) : (
              <>
                <div className="space-y-4 mb-5">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Entry Price (ZAR per share) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={portfolioModal.entryPrice}
                      onChange={(e) => setPortfolioModal((m) => ({ ...m, entryPrice: e.target.value }))}
                      placeholder="e.g. 185.50"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Number of Shares <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={portfolioModal.shares}
                      onChange={(e) => setPortfolioModal((m) => ({ ...m, shares: e.target.value }))}
                      placeholder="e.g. 100"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                    />
                  </div>

                  {/* Summary preview */}
                  {portfolioModal.entryPrice && portfolioModal.shares &&
                    !isNaN(parseFloat(portfolioModal.entryPrice)) &&
                    !isNaN(parseFloat(portfolioModal.shares)) && (
                    <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
                      <div className="flex justify-between">
                        <span>Total cost</span>
                        <span className="font-medium">
                          {formatCurrency(parseFloat(portfolioModal.entryPrice) * parseFloat(portfolioModal.shares))}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {portfolioModal.error && (
                  <p className="text-red-500 text-xs mb-3">{portfolioModal.error}</p>
                )}

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setPortfolioModal({ ...EMPTY_PORTFOLIO_MODAL })}
                    className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:border-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmPortfolioAdd}
                    disabled={portfolioModal.saving}
                    className="px-4 py-2 text-sm text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: '#788c5d' }}
                  >
                    {portfolioModal.saving ? 'Adding...' : 'Confirm'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
