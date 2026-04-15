'use client';
import { useState, useEffect, useCallback } from 'react';

interface KPIs {
  healthScore: number;
  totalItems: number;
  belowThreshold: number;
  anomalyCount: number;
  weeklyUsageCost: number;
  weekVsPriorWeek: number;
  deadStockCount: number;
  estimatedWasteScore?: number;
}

interface AnomalyInsight {
  item_id: number;
  item_name: string;
  unit_cost: number;
  anomalyType: 'SPIKE' | 'DROP' | 'HIGH_VARIANCE';
  severity: 'critical' | 'warning' | 'info';
  recentAvg: number;
  baselineAvg: number;
  changePercent: number;
  zScore: number;
  costImpact: number;
  recommendation: string;
}

interface Suggestion {
  icon: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  impact?: string;
}

interface InsightsData {
  kpis: KPIs;
  anomalies: AnomalyInsight[];
  suggestions: Suggestion[];
  dowPattern: Record<number, { mean: number; count: number }>;
  topCostItems: { item_name: string; weekly_cost: number; burn_rate: number; current_stock: number }[];
  config: { insights_model: string };
}

type TabType = 'overview' | 'anomalies' | 'suggestions' | 'patterns';

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function SkeletonCard() {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 animate-pulse">
      <div className="h-4 bg-gray-700 rounded w-24 mb-3" />
      <div className="h-8 bg-gray-700 rounded w-16 mb-2" />
      <div className="h-3 bg-gray-700 rounded w-32" />
    </div>
  );
}

function SeverityBadge({ severity }: { severity: 'critical' | 'warning' | 'info' }) {
  const colors = {
    critical: 'bg-red-900/40 text-red-300 border-red-700',
    warning: 'bg-yellow-900/40 text-yellow-300 border-yellow-700',
    info: 'bg-blue-900/40 text-blue-300 border-blue-700',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${colors[severity]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${severity === 'critical' ? 'bg-red-400' : severity === 'warning' ? 'bg-yellow-400' : 'bg-blue-400'}`} />
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: 'high' | 'medium' | 'low' }) {
  const colors = {
    high: 'bg-red-900/40 text-red-300 border-red-700',
    medium: 'bg-yellow-900/40 text-yellow-300 border-yellow-700',
    low: 'bg-green-900/40 text-green-300 border-green-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${colors[priority]}`}>
      {priority.toUpperCase()}
    </span>
  );
}

export default function InsightsClient() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<{ id: number; name: string }[]>([]);
  const [locationId, setLocationId] = useState<string>('');
  const [timeRange, setTimeRange] = useState(90);
  const [tab, setTab] = useState<TabType>('overview');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');

  const fetchInsights = useCallback(async (locId: string, days: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ days: String(days) });
      if (locId) params.set('locationId', locId);
      const res = await fetch(`/api/admin/insights?${params}`);
      const json = await res.json();
      if (!json.error) setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch('/api/user/locations')
      .then(r => r.json())
      .then(d => {
        if (d.locations) {
          setLocations(d.locations);
          const match = document.cookie.match(/(^| )current_location_id=([^;]+)/);
          const cookieId = match ? match[2] : '';
          setLocationId(cookieId);
          fetchInsights(cookieId, timeRange);
        } else {
          fetchInsights('', timeRange);
        }
      })
      .catch(() => fetchInsights('', timeRange));
  }, []);

  const handleRefresh = () => fetchInsights(locationId, timeRange);
  const handleLocationChange = (val: string) => {
    setLocationId(val);
    fetchInsights(val, timeRange);
  };
  const handleTimeChange = (val: number) => {
    setTimeRange(val);
    fetchInsights(locationId, val);
  };

  const healthColor = (score: number) =>
    score >= 75 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400';
  const healthBg = (score: number) =>
    score >= 75 ? 'border-green-500/50' : score >= 50 ? 'border-yellow-500/50' : 'border-red-500/50';

  const tabs: { key: TabType; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'anomalies', label: `Anomalies${data ? ` (${data.anomalies.length})` : ''}` },
    { key: 'suggestions', label: `Suggestions${data ? ` (${data.suggestions.length})` : ''}` },
    { key: 'patterns', label: 'Patterns' },
  ];

  const filteredAnomalies = data?.anomalies.filter(
    a => severityFilter === 'all' || a.severity === severityFilter
  ) ?? [];

  const dowEntries = data
    ? Object.entries(data.dowPattern)
        .map(([dow, stats]) => ({ dow: Number(dow), ...stats }))
        .sort((a, b) => a.dow - b.dow)
    : [];
  const maxDow = dowEntries.length > 0 ? Math.max(...dowEntries.map(e => e.mean)) : 1;

  return (
    <div className="p-6 min-h-screen text-white">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            AI-Powered Insights
            {data?.config?.insights_model && (
              <span className="text-xs font-semibold bg-purple-900/50 text-purple-300 border border-purple-700 px-2.5 py-1 rounded-full ml-2">
                Model: {data.config.insights_model}
              </span>
            )}
          </h1>
          <p className="text-gray-400 mt-1 text-sm">
            Inventory intelligence powered by machine learning — last {timeRange} days
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {locations.length > 0 && (
            <select
              className="bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm"
              value={locationId}
              onChange={e => handleLocationChange(e.target.value)}
            >
              <option value="">All Locations</option>
              {locations.map(l => <option key={l.id} value={String(l.id)}>{l.name}</option>)}
            </select>
          )}
          <select
            className="bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm"
            value={timeRange}
            onChange={e => handleTimeChange(Number(e.target.value))}
          >
            <option value={30}>Last 30 Days</option>
            <option value={60}>Last 60 Days</option>
            <option value={90}>Last 90 Days</option>
          </select>
          <button
            onClick={handleRefresh}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
          >
            <span className={loading ? 'animate-spin inline-block' : ''}>↻</span>
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 bg-gray-800/50 p-1 rounded-xl border border-gray-700 w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === t.key
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
            ) : data ? (
              <>
                <div className={`bg-gray-800 border rounded-xl p-5 flex flex-col items-start gap-1 ${healthBg(data.kpis.healthScore)}`}>
                  <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Health Score</span>
                  <span className={`text-4xl font-black ${healthColor(data.kpis.healthScore)}`}>{data.kpis.healthScore}</span>
                  <span className="text-xs text-gray-500">out of 100</span>
                </div>
                <div className="bg-gray-800 border border-orange-700/30 rounded-xl p-5 flex flex-col items-start gap-1">
                  <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Anomalies</span>
                  <span className="text-4xl font-black text-orange-400">{data.kpis.anomalyCount}</span>
                  <span className="text-xs text-gray-500">last 7 days</span>
                </div>
                <div className="bg-gray-800 border border-blue-700/30 rounded-xl p-5 flex flex-col items-start gap-1">
                  <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Weekly Cost</span>
                  <span className="text-3xl font-black text-blue-400">${data.kpis.weeklyUsageCost.toFixed(0)}</span>
                  <span className="text-xs text-gray-500">estimated stock cost</span>
                </div>
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 flex flex-col items-start gap-1">
                  <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Week Change</span>
                  <span className={`text-3xl font-black ${data.kpis.weekVsPriorWeek <= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {data.kpis.weekVsPriorWeek > 0 ? '+' : ''}{data.kpis.weekVsPriorWeek.toFixed(1)}%
                  </span>
                  <span className="text-xs text-gray-500">{data.kpis.weekVsPriorWeek <= 0 ? '▼ less spend' : '▲ more spend'}</span>
                </div>
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 flex flex-col items-start gap-1">
                  <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Dead Stock</span>
                  <span className="text-4xl font-black text-gray-400">{data.kpis.deadStockCount}</span>
                  <span className="text-xs text-gray-500">no usage 21+ days</span>
                </div>
              </>
            ) : null}
          </div>

          {/* Two column: anomalies preview + suggestions preview */}
          {!loading && data && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
                <h3 className="font-bold text-white mb-4 flex items-center justify-between">
                  Top Anomalies
                  <button onClick={() => setTab('anomalies')} className="text-xs text-blue-400 hover:text-blue-300">View all →</button>
                </h3>
                {data.anomalies.length === 0 ? (
                  <p className="text-gray-500 text-sm py-4 text-center">No anomalies detected</p>
                ) : (
                  <div className="space-y-3">
                    {data.anomalies.slice(0, 5).map(a => (
                      <div key={a.item_id} className="flex items-center justify-between bg-gray-900/50 rounded-lg px-4 py-3">
                        <div>
                          <p className="font-semibold text-sm text-white">{a.item_name}</p>
                          <p className="text-xs text-gray-400">{a.anomalyType.replace('_', ' ')} · z={a.zScore.toFixed(1)}</p>
                        </div>
                        <SeverityBadge severity={a.severity} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
                <h3 className="font-bold text-white mb-4 flex items-center justify-between">
                  Top Suggestions
                  <button onClick={() => setTab('suggestions')} className="text-xs text-blue-400 hover:text-blue-300">View all →</button>
                </h3>
                {data.suggestions.length === 0 ? (
                  <p className="text-gray-500 text-sm py-4 text-center">No suggestions available</p>
                ) : (
                  <div className="space-y-3">
                    {data.suggestions.slice(0, 3).map((s, i) => (
                      <div key={i} className="bg-gray-900/50 rounded-lg px-4 py-3 flex items-start gap-3">
                        <span className="text-xl mt-0.5">{s.icon}</span>
                        <div>
                          <p className="font-semibold text-sm text-white">{s.title}</p>
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{s.description}</p>
                        </div>
                        <PriorityBadge priority={s.priority} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* DoW Chart */}
          {!loading && data && dowEntries.length > 0 && (
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
              <h3 className="font-bold text-white mb-5">Day of Week Usage Pattern</h3>
              <div className="flex items-end gap-4 h-28">
                {dowEntries.map(e => {
                  const h = maxDow > 0 ? Math.round((e.mean / maxDow) * 96) : 4;
                  const isBusiest = e.mean === maxDow;
                  return (
                    <div key={e.dow} className="flex flex-col items-center gap-2 flex-1">
                      <span className="text-xs text-gray-400">{e.mean.toFixed(1)}</span>
                      <div
                        className={`w-full rounded-t-md transition-all ${isBusiest ? 'bg-blue-500' : 'bg-blue-900/60'}`}
                        style={{ height: `${h}px`, minHeight: 4 }}
                      />
                      <span className={`text-xs font-medium ${isBusiest ? 'text-blue-400' : 'text-gray-500'}`}>
                        {DOW_LABELS[e.dow]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Anomalies Tab */}
      {tab === 'anomalies' && (
        <div>
          <div className="flex gap-2 mb-6">
            {(['all', 'critical', 'warning', 'info'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSeverityFilter(s)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  severityFilter === s
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'border-gray-600 text-gray-400 hover:text-white hover:border-gray-400'
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
          ) : filteredAnomalies.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-5xl mb-4">✅</p>
              <p className="text-white font-semibold text-lg">No anomalies detected</p>
              <p className="text-gray-400 text-sm mt-1">Your inventory patterns look normal for this period.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAnomalies.map(a => (
                <div
                  key={a.item_id}
                  className={`bg-gray-800 border rounded-xl p-6 ${
                    a.severity === 'critical' ? 'border-red-700/50' :
                    a.severity === 'warning' ? 'border-yellow-700/50' : 'border-blue-700/50'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <SeverityBadge severity={a.severity} />
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded bg-gray-700 text-gray-300`}>
                        {a.anomalyType.replace('_', ' ')}
                      </span>
                    </div>
                    <span className="text-sm text-gray-400">
                      Weekly impact: <strong className="text-white">${a.costImpact.toFixed(2)}</strong>
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">{a.item_name}</h3>
                  <p className="text-gray-300 text-sm mb-4">
                    Consumption {a.anomalyType === 'SPIKE' ? 'spiked' : a.anomalyType === 'DROP' ? 'dropped' : 'varied'}
                    {' '}{Math.abs(a.changePercent).toFixed(0)}% {a.changePercent >= 0 ? 'above' : 'below'} baseline last week
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="bg-gray-900/50 rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-400 mb-1">Recent Avg</p>
                      <p className="text-white font-bold">{a.recentAvg.toFixed(2)}/day</p>
                    </div>
                    <div className="bg-gray-900/50 rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-400 mb-1">Baseline Avg</p>
                      <p className="text-white font-bold">{a.baselineAvg.toFixed(2)}/day</p>
                    </div>
                    <div className="bg-gray-900/50 rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-400 mb-1">Z-Score</p>
                      <p className="text-white font-bold">{a.zScore.toFixed(2)}</p>
                    </div>
                    <div className="bg-gray-900/50 rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-400 mb-1">Unit Cost</p>
                      <p className="text-white font-bold">${a.unit_cost.toFixed(2)}</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-400 italic border-t border-gray-700 pt-3">{a.recommendation}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Suggestions Tab */}
      {tab === 'suggestions' && (
        <div>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : !data || data.suggestions.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-5xl mb-4">💡</p>
              <p className="text-white font-semibold text-lg">No suggestions at this time</p>
              <p className="text-gray-400 text-sm mt-1">Check back after more activity data is recorded.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.suggestions.map((s, i) => (
                <div
                  key={i}
                  className={`bg-gray-800 border rounded-xl p-5 flex flex-col gap-3 ${
                    s.priority === 'high' ? 'border-red-700/40' :
                    s.priority === 'medium' ? 'border-yellow-700/40' : 'border-gray-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-3xl">{s.icon}</span>
                    <PriorityBadge priority={s.priority} />
                  </div>
                  <div>
                    <h4 className="font-bold text-white">{s.title}</h4>
                    <p className="text-sm text-gray-400 mt-1">{s.description}</p>
                  </div>
                  {s.impact && (
                    <p className="text-xs font-semibold text-blue-400 bg-blue-900/20 border border-blue-800/40 px-3 py-1.5 rounded-lg w-fit">
                      Impact: {s.impact}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Patterns Tab */}
      {tab === 'patterns' && (
        <div className="space-y-8">
          {/* DoW full */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h3 className="font-bold text-white text-lg mb-6">Day of Week Usage Heatmap</h3>
            {!loading && data && dowEntries.length > 0 ? (
              <div className="flex items-end gap-4 h-36">
                {DOW_LABELS.map((label, dow) => {
                  const entry = dowEntries.find(e => e.dow === dow);
                  const mean = entry?.mean ?? 0;
                  const h = maxDow > 0 ? Math.max(4, Math.round((mean / maxDow) * 120)) : 4;
                  const isBusiest = entry && entry.mean === maxDow;
                  return (
                    <div key={dow} className="flex flex-col items-center gap-2 flex-1">
                      <span className="text-xs text-gray-400">{mean.toFixed(1)}</span>
                      <div
                        className={`w-full rounded-t-lg transition-all ${isBusiest ? 'bg-gradient-to-t from-blue-600 to-blue-400' : 'bg-gray-700 hover:bg-gray-600'}`}
                        style={{ height: `${h}px` }}
                        title={`${label}: avg ${mean.toFixed(2)} units`}
                      />
                      <span className={`text-sm font-semibold ${isBusiest ? 'text-blue-400' : 'text-gray-400'}`}>{label}</span>
                      {isBusiest && <span className="text-xs text-blue-400 font-bold">Busiest</span>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-500 text-sm py-8 text-center">Insufficient data for day-of-week analysis</p>
            )}
          </div>

          {/* Top cost items table */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h3 className="font-bold text-white text-lg mb-5">Top 10 Items by Weekly Cost</h3>
            {!loading && data && data.topCostItems.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase">
                      <th className="text-left py-2 px-3">Item</th>
                      <th className="text-right py-2 px-3">Weekly Cost</th>
                      <th className="text-right py-2 px-3">Burn Rate/day</th>
                      <th className="text-right py-2 px-3">Current Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/50">
                    {data.topCostItems.map((item, i) => (
                      <tr key={i} className="hover:bg-gray-700/30">
                        <td className="py-3 px-3 font-medium text-white">{item.item_name}</td>
                        <td className="py-3 px-3 text-right text-blue-400 font-semibold">${item.weekly_cost.toFixed(2)}</td>
                        <td className="py-3 px-3 text-right text-gray-300">{item.burn_rate.toFixed(2)}</td>
                        <td className="py-3 px-3 text-right text-gray-300">{item.current_stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500 text-sm py-4 text-center">No cost data available</p>
            )}
          </div>

          {/* Approaching stockout */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h3 className="font-bold text-white text-lg mb-5">Items Approaching Stockout (Next 7 Days)</h3>
            {!loading && data ? (
              (() => {
                const approaching = data.topCostItems.filter(item => {
                  if (item.burn_rate <= 0 || item.current_stock <= 0) return false;
                  return item.current_stock / item.burn_rate <= 7;
                });
                return approaching.length === 0 ? (
                  <p className="text-gray-500 text-sm py-4 text-center">No items approaching stockout in the next 7 days.</p>
                ) : (
                  <div className="space-y-3">
                    {approaching.map((item, i) => {
                      const daysLeft = item.burn_rate > 0 ? item.current_stock / item.burn_rate : 99;
                      return (
                        <div key={i} className="flex items-center justify-between bg-red-900/10 border border-red-800/30 rounded-lg px-4 py-3">
                          <div>
                            <p className="font-semibold text-white">{item.item_name}</p>
                            <p className="text-xs text-gray-400">Burn: {item.burn_rate.toFixed(2)}/day · Stock: {item.current_stock}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-red-400 text-lg">{Math.floor(daysLeft)} days</p>
                            <p className="text-xs text-gray-500">until empty</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            ) : (
              <div className="animate-pulse h-16 bg-gray-700 rounded" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
