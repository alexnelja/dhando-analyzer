import React, { useEffect, useState } from 'react';
import { ScoreCard } from '../components/ScoreCard';
import { TrafficLightBadge } from '../components/TrafficLight';
import type { InvestmentRow, InvestmentStatus } from '../lib/ipc';
import { listWatchlist, listPositions } from '../lib/ipc';

const PIPELINE_STAGES: InvestmentStatus[] = [
  'screening',
  'researching',
  'deep_dive',
  'ready_to_buy',
];

const STAGE_LABELS: Record<string, string> = {
  screening: 'Screening',
  researching: 'Researching',
  deep_dive: 'Deep Dive',
  ready_to_buy: 'Ready to Buy',
};

interface PipelineCounts {
  screening: number;
  researching: number;
  deep_dive: number;
  ready_to_buy: number;
}

export function Dashboard() {
  const [investments, setInvestments] = useState<InvestmentRow[]>([]);
  const [positionCount, setPositionCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [inv, positions] = await Promise.all([
          listWatchlist(),
          listPositions(),
        ]);
        setInvestments(inv);
        setPositionCount(positions.length);
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const pipelineCounts = PIPELINE_STAGES.reduce<PipelineCounts>(
    (acc, stage) => ({
      ...acc,
      [stage]: investments.filter((i) => i.status === stage).length,
    }),
    { screening: 0, researching: 0, deep_dive: 0, ready_to_buy: 0 },
  );

  const totalWatchlist = investments.filter(
    (i) => !['exited', 'rejected'].includes(i.status),
  ).length;

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1 text-sm">System overview — portfolio, pipeline, and alerts</p>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">Loading...</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <ScoreCard
              label="Positions Held"
              value={positionCount}
              subtitle="Active portfolio"
              color="green"
            />
            <ScoreCard
              label="Watchlist"
              value={totalWatchlist}
              subtitle="Active pipeline entries"
              color="blue"
            />
            <ScoreCard
              label="Ready to Buy"
              value={pipelineCounts.ready_to_buy}
              subtitle="Fully analyzed"
              color="orange"
            />
            <ScoreCard
              label="Deep Dive"
              value={pipelineCounts.deep_dive}
              subtitle="In analysis"
              color="gray"
            />
          </div>

          {/* Pipeline funnel */}
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
              Pipeline Funnel
            </h2>
            <div className="bg-white rounded-xl border border-gray-200/60 overflow-hidden">
              {PIPELINE_STAGES.map((stage, idx) => {
                const count = pipelineCounts[stage as keyof PipelineCounts];
                const max = Math.max(pipelineCounts.screening, 1);
                const widthPct = Math.max((count / max) * 100, count > 0 ? 4 : 0);

                return (
                  <div
                    key={stage}
                    className={`flex items-center px-6 py-4 ${
                      idx < PIPELINE_STAGES.length - 1 ? 'border-b border-gray-100' : ''
                    }`}
                  >
                    <span className="w-36 text-sm text-gray-600 shrink-0">
                      {STAGE_LABELS[stage]}
                    </span>
                    <div className="flex-1 mx-4 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${widthPct}%`,
                          backgroundColor: stage === 'ready_to_buy' ? '#788c5d' : '#d97757',
                          opacity: 1 - idx * 0.12,
                        }}
                      />
                    </div>
                    <span className="w-8 text-right text-sm font-semibold text-gray-700">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Recent watchlist entries */}
          <section>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
              Recent Entries
            </h2>
            {investments.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200/60 px-6 py-8 text-center text-gray-400 text-sm">
                No investments yet. Add your first entry in the Watchlist tab.
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200/60 divide-y divide-gray-100">
                {investments.slice(0, 8).map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between px-6 py-3">
                    <div>
                      <span className="text-sm font-medium text-gray-800">{inv.name}</span>
                      {inv.ticker && (
                        <span className="ml-2 text-xs text-gray-400">{inv.ticker}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {inv.sector && (
                        <span className="text-xs text-gray-400">{inv.sector}</span>
                      )}
                      <TrafficLightBadge
                        status={
                          inv.status === 'ready_to_buy'
                            ? 'green'
                            : inv.status === 'deep_dive' || inv.status === 'researching'
                            ? 'amber'
                            : 'red'
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
