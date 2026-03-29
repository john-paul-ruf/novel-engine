import { useEffect } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts';
import { useStatisticsStore } from '../../stores/statisticsStore';
import { useBookStore } from '../../stores/bookStore';
import type { BookStatistics } from '@domain/types';
import { AGENT_REGISTRY } from '@domain/constants';
import type { AgentName } from '@domain/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

const cardClass = 'rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4';
const chartGrid = { strokeDasharray: '3 3', stroke: '#3f3f46' };
const axisTick = { fill: '#a1a1aa', fontSize: 12 };
const tooltipStyle = { backgroundColor: '#18181b', border: '1px solid #3f3f46', color: '#e4e4e7' };

const PHASE_COLORS = [
  '#f59e0b', '#8b5cf6', '#06b6d4', '#10b981', '#ef4444',
  '#f97316', '#6366f1', '#ec4899', '#14b8a6', '#a855f7',
  '#eab308', '#22c55e', '#3b82f6', '#e11d48',
];

// ---------------------------------------------------------------------------
// Summary Cards
// ---------------------------------------------------------------------------

function SummaryCards({ data, showWords }: { data: BookStatistics; showWords: boolean }): React.ReactElement {
  const totalTokens = data.totalTokens.input + data.totalTokens.output + data.totalTokens.thinking;
  const totalWords = data.wordsPerChapter.reduce((sum, ch) => sum + ch.wordCount, 0);

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <div className={cardClass}>
        <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Total Tokens</div>
        <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{formatTokens(totalTokens)}</div>
        <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
          {formatTokens(data.totalTokens.input)} in / {formatTokens(data.totalTokens.output)} out / {formatTokens(data.totalTokens.thinking)} think
        </div>
      </div>
      <div className={cardClass}>
        <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Conversations</div>
        <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{data.conversationCount}</div>
      </div>
      <div className={cardClass}>
        <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Estimated Cost</div>
        <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">~${data.totalCostEstimate.toFixed(2)}</div>
        <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">at API rates</div>
      </div>
      {showWords && (
        <div className={cardClass}>
          <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Total Words</div>
          <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{totalWords.toLocaleString()}</div>
          <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
            {data.wordsPerChapter.length} chapter{data.wordsPerChapter.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Token Usage Over Time
// ---------------------------------------------------------------------------

function UsageOverTimeChart({ data }: { data: BookStatistics }): React.ReactElement {
  if (data.usageOverTime.length === 0) {
    return (
      <div className={cardClass}>
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Token Usage Over Time</h3>
        <p className="text-sm text-zinc-400 dark:text-zinc-500">No usage data recorded yet.</p>
      </div>
    );
  }

  const chartData = data.usageOverTime.map((p) => ({
    ...p,
    date: formatDate(p.date),
  }));

  return (
    <div className={cardClass}>
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Token Usage Over Time</h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}>
          <CartesianGrid {...chartGrid} />
          <XAxis dataKey="date" tick={axisTick} />
          <YAxis tick={axisTick} tickFormatter={formatTokens} />
          <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatTokens(Number(value))} />
          <Area type="monotone" dataKey="inputTokens" stackId="1" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.3} name="Input" />
          <Area type="monotone" dataKey="outputTokens" stackId="1" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.3} name="Output" />
          <Area type="monotone" dataKey="thinkingTokens" stackId="1" stroke="#fbbf24" fill="#fbbf24" fillOpacity={0.3} name="Thinking" />
          <Legend />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-Agent Breakdown
// ---------------------------------------------------------------------------

function AgentBreakdownChart({ data }: { data: BookStatistics }): React.ReactElement {
  if (data.perAgent.length === 0) {
    return (
      <div className={cardClass}>
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Usage by Agent</h3>
        <p className="text-sm text-zinc-400 dark:text-zinc-500">No agent data yet.</p>
      </div>
    );
  }

  const chartData = data.perAgent.map((a) => ({
    name: a.agentName,
    tokens: a.inputTokens + a.outputTokens + a.thinkingTokens,
    cost: a.estimatedCost,
    fill: AGENT_REGISTRY[a.agentName as AgentName]?.color ?? '#71717a',
  }));

  return (
    <div className={cardClass}>
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Usage by Agent</h3>
      <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 40)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
          <CartesianGrid {...chartGrid} horizontal={false} />
          <XAxis type="number" tick={axisTick} tickFormatter={formatTokens} />
          <YAxis type="category" dataKey="name" tick={axisTick} width={80} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => {
              const n = Number(value);
              if (name === 'cost') return [`$${n.toFixed(2)}`, 'Cost'];
              return [formatTokens(n), 'Tokens'];
            }}
          />
          <Bar dataKey="tokens" name="Tokens" radius={[0, 4, 4, 0]}>
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-3 border-t border-zinc-200 dark:border-zinc-800 pt-3">
        <div className="grid grid-cols-3 gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          {chartData.map((a) => (
            <div key={a.name} className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: a.fill }} />
              <span className="truncate">{a.name}</span>
              <span className="ml-auto text-zinc-600 dark:text-zinc-300">${a.cost.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-Phase Breakdown
// ---------------------------------------------------------------------------

function PhaseBreakdownChart({ data }: { data: BookStatistics }): React.ReactElement {
  if (data.perPhase.length === 0) {
    return (
      <div className={cardClass}>
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Usage by Phase</h3>
        <p className="text-sm text-zinc-400 dark:text-zinc-500">No phase data yet.</p>
      </div>
    );
  }

  const chartData = data.perPhase.map((p, i) => ({
    name: p.phase,
    tokens: p.inputTokens + p.outputTokens + p.thinkingTokens,
    cost: p.estimatedCost,
    fill: PHASE_COLORS[i % PHASE_COLORS.length],
  }));

  return (
    <div className={cardClass}>
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Usage by Phase</h3>
      <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 40)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
          <CartesianGrid {...chartGrid} horizontal={false} />
          <XAxis type="number" tick={axisTick} tickFormatter={formatTokens} />
          <YAxis type="category" dataKey="name" tick={axisTick} width={120} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value) => formatTokens(Number(value))}
          />
          <Bar dataKey="tokens" name="Tokens" radius={[0, 4, 4, 0]}>
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Word Count History
// ---------------------------------------------------------------------------

function WordCountHistoryChart({ data }: { data: BookStatistics }): React.ReactElement {
  if (data.wordCountHistory.length === 0) {
    return (
      <div className={cardClass}>
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Word Count History</h3>
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          No history yet — word counts are recorded after each agent interaction.
        </p>
      </div>
    );
  }

  const chartData = data.wordCountHistory.map((s) => ({
    date: formatDate(s.recordedAt),
    words: s.wordCount,
  }));

  return (
    <div className={cardClass}>
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Word Count History</h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}>
          <CartesianGrid {...chartGrid} />
          <XAxis dataKey="date" tick={axisTick} />
          <YAxis tick={axisTick} tickFormatter={(v: number) => v.toLocaleString()} />
          <Tooltip contentStyle={tooltipStyle} formatter={(value) => Number(value).toLocaleString()} />
          <Area type="monotone" dataKey="words" stroke="#4ade80" fill="#4ade80" fillOpacity={0.3} name="Words" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Words Per Chapter
// ---------------------------------------------------------------------------

function WordsPerChapterChart({ data }: { data: BookStatistics }): React.ReactElement | null {
  if (data.wordsPerChapter.length === 0) return null;

  const chartData = data.wordsPerChapter.map((ch) => ({
    name: ch.slug,
    words: ch.wordCount,
  }));

  return (
    <div className={cardClass}>
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Words Per Chapter</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid {...chartGrid} />
          <XAxis dataKey="name" tick={axisTick} angle={-45} textAnchor="end" height={80} />
          <YAxis tick={axisTick} tickFormatter={(v: number) => v.toLocaleString()} />
          <Tooltip contentStyle={tooltipStyle} formatter={(value) => Number(value).toLocaleString()} />
          <Bar dataKey="words" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Words" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function StatisticsView(): React.ReactElement {
  const { data, loading, error, load, bookFilter, setBookFilter } = useStatisticsStore();
  const { books, activeSlug } = useBookStore();

  useEffect(() => {
    load(bookFilter ?? activeSlug);
  }, [activeSlug, bookFilter, load]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Writing Statistics</h1>
          <div className="flex items-center gap-3">
            {loading && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500">Loading...</span>
            )}
            <select
              value={bookFilter ?? ''}
              onChange={(e) => setBookFilter(e.target.value || null)}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100"
            >
              <option value="">All Books</option>
              {books.map((book) => (
                <option key={book.slug} value={book.slug}>
                  {book.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Error state */}
        {error && !data && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
              <button
                onClick={() => load(bookFilter ?? activeSlug)}
                className="mt-3 rounded-md bg-blue-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-600 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {data && data.conversationCount === 0 && data.usageOverTime.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="text-4xl mb-3">&#x1F4CA;</div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No usage data recorded yet. Statistics will appear after your first agent interaction.
              </p>
            </div>
          </div>
        )}

        {/* Charts */}
        {data && (data.conversationCount > 0 || data.usageOverTime.length > 0) && (
          <div className="space-y-4">
            <SummaryCards data={data} showWords={bookFilter !== null} />
            <UsageOverTimeChart data={data} />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <AgentBreakdownChart data={data} />
              <PhaseBreakdownChart data={data} />
            </div>
            <WordCountHistoryChart data={data} />
            {bookFilter && <WordsPerChapterChart data={data} />}
          </div>
        )}
      </div>
    </div>
  );
}
