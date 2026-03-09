import { useState, useEffect, useCallback, useMemo } from 'react';
import * as api from '@/services/api';
import styles from './UsagePage.module.css';

// ── Helpers ──

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

type Period = '1d' | '7d' | '30d' | 'all';

const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: '1d', label: '过去一天' },
  { key: '7d', label: '过去一周' },
  { key: '30d', label: '过去一个月' },
  { key: 'all', label: '历史累计' },
];

const PAGE_SIZE = 20;

// ── Session parent resolution (reuse logic from SessionList) ──

/**
 * Resolve the root ancestor for a session id using parentMap + heuristics.
 * Returns the root ancestor id (may be itself if no parent found).
 */
function resolveRoot(
  sessionId: string,
  parentMap: Record<string, string>,
  allIds: Set<string>,
): string {
  const visited = new Set<string>();
  let current = sessionId;
  while (true) {
    if (visited.has(current)) break; // cycle guard
    visited.add(current);
    const parent = resolveParent(current, parentMap, allIds);
    if (!parent) break;
    current = parent;
  }
  return current;
}

function resolveParent(
  id: string,
  parentMap: Record<string, string>,
  allIds: Set<string>,
): string | null {
  // 1. Manual override
  if (parentMap[id]) return parentMap[id];

  // 2. Subagent heuristic
  if (id.startsWith('subagent_')) {
    const suffix = id.substring('subagent_'.length);
    const match = suffix.match(/^(.+)_([0-9a-f]{8})$/);
    if (match) return match[1];
  }

  // 3. Webchat API session heuristic
  if (id.startsWith('webchat_')) {
    const suffix = id.substring('webchat_'.length);
    if (/[^0-9]/.test(suffix)) {
      const tsMatch = suffix.match(/_(\d{10})(?:_|$)/);
      if (tsMatch) {
        const ts = tsMatch[1];
        // Priority a: exact match — {channel}_{timestamp}
        for (const candidate of allIds) {
          if (candidate.endsWith('_' + ts) && candidate !== id) {
            const prefix = candidate.substring(0, candidate.length - ts.length - 1);
            if (!/\d{10}/.test(prefix)) return candidate;
          }
        }
        // Priority b: suffix match
        for (const candidate of allIds) {
          if (candidate !== id && candidate.endsWith('_' + ts)) {
            return candidate;
          }
        }
      }
    }
  }

  return null;
}

// ── SVG Line Chart ──

interface ChartPoint {
  date: string;
  total: number;
  input: number;
  cacheRead: number;
}

function LineChart({ data }: { data: ChartPoint[] }) {
  if (data.length === 0) return null;

  const W = 720;
  const H = 200;
  const PAD_L = 55;
  const PAD_R = 15;
  const PAD_T = 15;
  const PAD_B = 30;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const maxVal = Math.max(...data.map(d => d.total), 1);
  // Round up to nice number
  const niceMax = (() => {
    const mag = Math.pow(10, Math.floor(Math.log10(maxVal)));
    const norm = maxVal / mag;
    if (norm <= 1) return mag;
    if (norm <= 2) return 2 * mag;
    if (norm <= 5) return 5 * mag;
    return 10 * mag;
  })();

  const xScale = (i: number) => PAD_L + (i / Math.max(data.length - 1, 1)) * chartW;
  const yScale = (v: number) => PAD_T + chartH - (v / niceMax) * chartH;

  const makePath = (values: number[]) =>
    values.map((v, i) => `${xScale(i)},${yScale(v)}`).join(' ');

  // Y-axis ticks (4 ticks)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => f * niceMax);

  // X-axis labels (show ~6-8 labels max)
  const labelStep = Math.max(1, Math.floor(data.length / 7));

  const [hover, setHover] = useState<number | null>(null);

  return (
    <div className={styles.chartContainer}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={styles.svgChart}
        onMouseLeave={() => setHover(null)}
      >
        {/* Y-axis grid + labels */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD_L} y1={yScale(v)} x2={W - PAD_R} y2={yScale(v)}
              stroke="var(--border)" strokeWidth={0.5} strokeDasharray={i === 0 ? undefined : '3,3'}
            />
            <text x={PAD_L - 6} y={yScale(v) + 3} textAnchor="end" fontSize={9} fill="var(--text-muted)">
              {formatTokens(v)}
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {data.map((d, i) =>
          i % labelStep === 0 || i === data.length - 1 ? (
            <text key={i} x={xScale(i)} y={H - 5} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
              {formatDate(d.date)}
            </text>
          ) : null
        )}

        {/* Lines */}
        {data.length > 1 ? (
          <>
            <polyline
              points={makePath(data.map(d => d.total))}
              fill="none" stroke="#60a5fa" strokeWidth={2} strokeLinejoin="round"
            />
            <polyline
              points={makePath(data.map(d => d.input))}
              fill="none" stroke="#3b82f6" strokeWidth={1.5} strokeLinejoin="round" strokeDasharray="4,2"
            />
            <polyline
              points={makePath(data.map(d => d.cacheRead))}
              fill="none" stroke="#4caf50" strokeWidth={1.5} strokeLinejoin="round"
            />
          </>
        ) : (
          // Single point — draw dots
          <>
            <circle cx={xScale(0)} cy={yScale(data[0].total)} r={4} fill="#60a5fa" />
            <circle cx={xScale(0)} cy={yScale(data[0].input)} r={3} fill="#3b82f6" />
            <circle cx={xScale(0)} cy={yScale(data[0].cacheRead)} r={3} fill="#4caf50" />
          </>
        )}

        {/* Hover targets */}
        {data.map((_, i) => (
          <rect
            key={i}
            x={xScale(i) - chartW / data.length / 2}
            y={PAD_T}
            width={chartW / data.length}
            height={chartH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}

        {/* Hover indicator */}
        {hover !== null && (
          <>
            <line
              x1={xScale(hover)} y1={PAD_T} x2={xScale(hover)} y2={PAD_T + chartH}
              stroke="var(--text-muted)" strokeWidth={0.5} strokeDasharray="3,3"
            />
            <circle cx={xScale(hover)} cy={yScale(data[hover].total)} r={3} fill="#60a5fa" />
            <circle cx={xScale(hover)} cy={yScale(data[hover].input)} r={3} fill="#3b82f6" />
            <circle cx={xScale(hover)} cy={yScale(data[hover].cacheRead)} r={3} fill="#4caf50" />
          </>
        )}
      </svg>

      {/* Tooltip */}
      {hover !== null && (
        <div
          className={styles.chartTooltip}
          style={{
            left: `${(xScale(hover) / W) * 100}%`,
          }}
        >
          <div className={styles.tooltipDate}>{data[hover].date}</div>
          <div><span style={{ color: '#60a5fa' }}>●</span> 总计: {formatTokens(data[hover].total)}</div>
          <div><span style={{ color: '#3b82f6' }}>●</span> 输入: {formatTokens(data[hover].input)}</div>
          <div><span style={{ color: '#4caf50' }}>●</span> 缓存命中: {formatTokens(data[hover].cacheRead)}</div>
        </div>
      )}

      {/* Legend */}
      <div className={styles.chartLegend}>
        <span className={styles.legendItem}>
          <span className={styles.legendLine} style={{ background: '#60a5fa' }} /> 总计
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendLine} style={{ background: '#3b82f6' }} /> 输入
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendLine} style={{ background: '#4caf50' }} /> 缓存命中
        </span>
      </div>
    </div>
  );
}

// ── Main Component ──

export default function UsagePage() {
  const [period, setPeriod] = useState<Period>('all');
  const [globalUsage, setGlobalUsage] = useState<api.UsageStats | null>(null);
  const [dailyUsage, setDailyUsage] = useState<api.DailyUsage[]>([]);
  const [parentMap, setParentMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [sessionPage, setSessionPage] = useState(0);

  const loadData = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const [global, daily, parents] = await Promise.all([
        api.fetchUsage(p),
        api.fetchDailyUsage(365, p),
        api.fetchSessionParents(),
      ]);
      setGlobalUsage(global);
      setDailyUsage(daily);
      setParentMap(parents);
      setSessionPage(0);
    } catch (e) {
      console.error('Failed to load usage data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(period);
  }, [period, loadData]);

  // ── Session aggregation ──
  const aggregatedSessions = useMemo(() => {
    if (!globalUsage) return [];

    const sessions = globalUsage.by_session;
    // Build id set from session_id (which is session_key format like "webchat:xxx")
    // Convert to id format (underscore): "webchat:xxx" → "webchat_xxx"
    const idFromSessionId = (sid: string) => sid.replace(':', '_');
    const allIds = new Set(sessions.map(s => idFromSessionId(s.session_id)));

    // Build root map
    const rootMap = new Map<string, typeof sessions>();
    for (const s of sessions) {
      const sid = idFromSessionId(s.session_id);
      const root = resolveRoot(sid, parentMap, allIds);
      if (!rootMap.has(root)) rootMap.set(root, []);
      rootMap.get(root)!.push(s);
    }

    // Aggregate
    const result: (api.UsageBySession & { childCount: number })[] = [];
    for (const [rootId, group] of rootMap) {
      const rootSession = group.find(s => idFromSessionId(s.session_id) === rootId);
      const agg = {
        session_id: rootSession?.session_id || rootId.replace('_', ':'),
        summary: rootSession?.summary || rootId,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        llm_calls: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        last_used: '',
        deleted: rootSession?.deleted,
        childCount: group.length - 1,
      };
      for (const s of group) {
        agg.prompt_tokens += s.prompt_tokens;
        agg.completion_tokens += s.completion_tokens;
        agg.total_tokens += s.total_tokens;
        agg.llm_calls += s.llm_calls;
        agg.cache_creation_input_tokens += (s.cache_creation_input_tokens ?? 0);
        agg.cache_read_input_tokens += (s.cache_read_input_tokens ?? 0);
        if (s.last_used > agg.last_used) agg.last_used = s.last_used;
      }
      result.push(agg);
    }

    result.sort((a, b) => b.total_tokens - a.total_tokens);
    return result;
  }, [globalUsage, parentMap]);

  // Split active / deleted
  const activeSessions = useMemo(() => aggregatedSessions.filter(s => !s.deleted), [aggregatedSessions]);
  const deletedSessions = useMemo(() => aggregatedSessions.filter(s => s.deleted), [aggregatedSessions]);
  const deletedAgg = useMemo(() => deletedSessions.reduce(
    (acc, s) => ({
      prompt_tokens: acc.prompt_tokens + s.prompt_tokens,
      completion_tokens: acc.completion_tokens + s.completion_tokens,
      total_tokens: acc.total_tokens + s.total_tokens,
      llm_calls: acc.llm_calls + s.llm_calls,
    }),
    { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, llm_calls: 0 },
  ), [deletedSessions]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(activeSessions.length / PAGE_SIZE));
  const pagedSessions = activeSessions.slice(sessionPage * PAGE_SIZE, (sessionPage + 1) * PAGE_SIZE);

  // Chart data
  const chartData: ChartPoint[] = useMemo(() =>
    dailyUsage.map(d => ({
      date: d.date,
      total: d.total_tokens,
      input: d.prompt_tokens,
      cacheRead: d.cache_read_input_tokens ?? 0,
    })),
    [dailyUsage],
  );

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>加载中...</div>
      </div>
    );
  }

  if (!globalUsage) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>暂无用量数据</div>
      </div>
    );
  }

  const cacheRead = globalUsage.total_cache_read_input_tokens ?? 0;
  const cacheCreation = globalUsage.total_cache_creation_input_tokens ?? 0;
  const uncached = Math.max(0, globalUsage.total_prompt_tokens - cacheRead - cacheCreation);
  const modelEntries = Object.entries(globalUsage.by_model);

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <h2 className={styles.title}>📊 用量统计</h2>

        {/* Period Selector */}
        <div className={styles.periodBar}>
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.key}
              className={`${styles.periodBtn} ${period === opt.key ? styles.periodBtnActive : ''}`}
              onClick={() => setPeriod(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Summary Cards */}
        <div className={styles.cards}>
          <div className={styles.card}>
            <div className={styles.cardLabel}>总 Tokens</div>
            <div className={styles.cardValue}>{formatTokens(globalUsage.total_tokens)}</div>
          </div>
          <div className={styles.card}>
            <div className={styles.cardLabel}>输入 Tokens</div>
            <div className={styles.cardValue}>{formatTokens(globalUsage.total_prompt_tokens)}</div>
          </div>
          <div className={styles.card}>
            <div className={styles.cardLabel}>输出 Tokens</div>
            <div className={styles.cardValue}>{formatTokens(globalUsage.total_completion_tokens)}</div>
          </div>
          <div className={styles.card}>
            <div className={styles.cardLabel}>调用次数</div>
            <div className={styles.cardValue}>{globalUsage.total_llm_calls}</div>
          </div>
          {cacheRead > 0 && (
            <div className={styles.card}>
              <div className={styles.cardLabel}>缓存命中</div>
              <div className={styles.cardValue} style={{ color: '#4caf50' }}>
                {formatTokens(cacheRead)}
              </div>
            </div>
          )}
          {cacheCreation > 0 && (
            <div className={styles.card}>
              <div className={styles.cardLabel}>缓存写入</div>
              <div className={styles.cardValue} style={{ color: '#ff9800' }}>
                {formatTokens(cacheCreation)}
              </div>
            </div>
          )}
          {uncached > 0 && (
            <div className={styles.card}>
              <div className={styles.cardLabel}>未缓存</div>
              <div className={styles.cardValue} style={{ color: '#ef5350' }}>
                {formatTokens(uncached)}
              </div>
            </div>
          )}
        </div>

        {/* Daily Trend Chart */}
        {chartData.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>每日趋势</h3>
            <div className={styles.chart}>
              <LineChart data={chartData} />
            </div>
          </div>
        )}

        {/* By Model */}
        {modelEntries.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>按模型</h3>
            <div className={styles.table}>
              <div className={styles.tableHeader}>
                <span className={styles.colModel}>模型</span>
                <span className={styles.colNum}>输入</span>
                <span className={styles.colNum}>输出</span>
                <span className={styles.colNum}>总计</span>
                <span className={styles.colNum}>调用</span>
              </div>
              {modelEntries.map(([model, stats]) => (
                <div key={model} className={styles.tableRow}>
                  <span className={styles.colModel} title={model}>
                    {model.split('/').pop()}
                  </span>
                  <span className={styles.colNum}>{formatTokens(stats.prompt_tokens)}</span>
                  <span className={styles.colNum}>{formatTokens(stats.completion_tokens)}</span>
                  <span className={styles.colNum}>{formatTokens(stats.total_tokens)}</span>
                  <span className={styles.colNum}>{stats.llm_calls}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* By Session (aggregated + paginated) */}
        {aggregatedSessions.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>
              按对话
              <span className={styles.sessionCount}>
                {activeSessions.length} 个对话
                {deletedSessions.length > 0 && ` + ${deletedSessions.length} 个已删除`}
              </span>
            </h3>
            <div className={styles.table}>
              <div className={styles.tableHeader}>
                <span className={styles.colSession}>对话</span>
                <span className={styles.colNum}>输入</span>
                <span className={styles.colNum}>输出</span>
                <span className={styles.colNum}>总计</span>
                <span className={styles.colNum}>调用</span>
              </div>
              {pagedSessions.map((s) => (
                <div key={s.session_id} className={styles.tableRow}>
                  <span className={styles.colSession} title={s.session_id}>
                    {s.summary || s.session_id}
                    {s.childCount > 0 && (
                      <span className={styles.childBadge}>+{s.childCount}</span>
                    )}
                  </span>
                  <span className={styles.colNum}>{formatTokens(s.prompt_tokens)}</span>
                  <span className={styles.colNum}>{formatTokens(s.completion_tokens)}</span>
                  <span className={styles.colNum}>{formatTokens(s.total_tokens)}</span>
                  <span className={styles.colNum}>{s.llm_calls}</span>
                </div>
              ))}
              {deletedSessions.length > 0 && sessionPage === totalPages - 1 && (
                <div className={`${styles.tableRow} ${styles.deletedRow}`}>
                  <span className={styles.colSession} title={`${deletedSessions.length} 个已删除对话`}>
                    🗑️ 已删除对话 ({deletedSessions.length})
                  </span>
                  <span className={styles.colNum}>{formatTokens(deletedAgg.prompt_tokens)}</span>
                  <span className={styles.colNum}>{formatTokens(deletedAgg.completion_tokens)}</span>
                  <span className={styles.colNum}>{formatTokens(deletedAgg.total_tokens)}</span>
                  <span className={styles.colNum}>{deletedAgg.llm_calls}</span>
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className={styles.pagination}>
                <button
                  className={styles.pageBtn}
                  disabled={sessionPage === 0}
                  onClick={() => setSessionPage(p => p - 1)}
                >
                  ← 上一页
                </button>
                <span className={styles.pageInfo}>
                  第 {sessionPage + 1} / {totalPages} 页
                </span>
                <button
                  className={styles.pageBtn}
                  disabled={sessionPage >= totalPages - 1}
                  onClick={() => setSessionPage(p => p + 1)}
                >
                  下一页 →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
