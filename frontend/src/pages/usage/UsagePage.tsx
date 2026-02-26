import { useState, useEffect, useCallback } from 'react';
import * as api from '@/services/api';
import styles from './UsagePage.module.css';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function UsagePage() {
  const [globalUsage, setGlobalUsage] = useState<api.UsageStats | null>(null);
  const [dailyUsage, setDailyUsage] = useState<api.DailyUsage[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [global, daily] = await Promise.all([
        api.fetchUsage(),
        api.fetchDailyUsage(30),
      ]);
      setGlobalUsage(global);
      setDailyUsage(daily);
    } catch (e) {
      console.error('Failed to load usage data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  const modelEntries = Object.entries(globalUsage.by_model);
  const maxDailyTokens = Math.max(...dailyUsage.map(d => d.total_tokens), 1);

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <h2 className={styles.title}>📊 用量统计</h2>

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
        </div>

        {/* Daily Trend Chart */}
        {dailyUsage.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>每日趋势</h3>
            <div className={styles.chart}>
              <div className={styles.chartBars}>
                {dailyUsage.map((day) => {
                  const heightPct = (day.total_tokens / maxDailyTokens) * 100;
                  return (
                    <div key={day.date} className={styles.barGroup}>
                      <div className={styles.barTooltip}>
                        {formatTokens(day.total_tokens)} · {day.llm_calls}次
                      </div>
                      <div className={styles.barContainer}>
                        <div
                          className={styles.barFill}
                          style={{ height: `${Math.max(heightPct, 2)}%` }}
                        >
                          <div
                            className={styles.barInput}
                            style={{
                              height: day.total_tokens > 0
                                ? `${(day.prompt_tokens / day.total_tokens) * 100}%`
                                : '0%',
                            }}
                          />
                        </div>
                      </div>
                      <div className={styles.barLabel}>{formatDate(day.date)}</div>
                    </div>
                  );
                })}
              </div>
              <div className={styles.chartLegend}>
                <span className={styles.legendItem}>
                  <span className={styles.legendDotInput} /> 输入
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.legendDotOutput} /> 输出
                </span>
              </div>
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

        {/* By Session */}
        {globalUsage.by_session.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>按对话</h3>
            <div className={styles.table}>
              <div className={styles.tableHeader}>
                <span className={styles.colSession}>对话</span>
                <span className={styles.colNum}>输入</span>
                <span className={styles.colNum}>输出</span>
                <span className={styles.colNum}>总计</span>
                <span className={styles.colNum}>调用</span>
              </div>
              {(() => {
                const activeSessions = globalUsage.by_session.filter(s => !s.deleted);
                const deletedSessions = globalUsage.by_session.filter(s => s.deleted);
                const deletedAgg = deletedSessions.reduce(
                  (acc, s) => ({
                    prompt_tokens: acc.prompt_tokens + s.prompt_tokens,
                    completion_tokens: acc.completion_tokens + s.completion_tokens,
                    total_tokens: acc.total_tokens + s.total_tokens,
                    llm_calls: acc.llm_calls + s.llm_calls,
                  }),
                  { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, llm_calls: 0 }
                );

                return (
                  <>
                    {activeSessions.map((s) => (
                      <div key={s.session_id} className={styles.tableRow}>
                        <span className={styles.colSession} title={s.session_id}>
                          {s.summary || s.session_id}
                        </span>
                        <span className={styles.colNum}>{formatTokens(s.prompt_tokens)}</span>
                        <span className={styles.colNum}>{formatTokens(s.completion_tokens)}</span>
                        <span className={styles.colNum}>{formatTokens(s.total_tokens)}</span>
                        <span className={styles.colNum}>{s.llm_calls}</span>
                      </div>
                    ))}
                    {deletedSessions.length > 0 && (
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
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
