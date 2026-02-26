import { useState, useEffect, useCallback } from 'react';
import { useSessionStore } from '@/store/sessionStore';
import * as api from '@/services/api';
import styles from './Sidebar.module.css';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Convert frontend session_id (cli_webchat) to session_key (cli:webchat) */
function toSessionKey(sessionId: string): string {
  const idx = sessionId.indexOf('_');
  if (idx > 0) return sessionId.substring(0, idx) + ':' + sessionId.substring(idx + 1);
  return sessionId;
}

export default function UsageIndicator() {
  const { activeSessionId } = useSessionStore();
  const [usage, setUsage] = useState<api.SessionUsage | null>(null);
  const [expanded, setExpanded] = useState(false);

  const loadUsage = useCallback(async () => {
    if (!activeSessionId) {
      setUsage(null);
      return;
    }
    try {
      const key = toSessionKey(activeSessionId);
      const data = await api.fetchSessionUsage(key);
      setUsage(data);
    } catch {
      setUsage(null);
    }
  }, [activeSessionId]);

  useEffect(() => {
    loadUsage();
    const timer = setInterval(loadUsage, 60_000);
    // Also refresh when a message completes (usage-updated event)
    const onUsageUpdated = () => loadUsage();
    window.addEventListener('usage-updated', onUsageUpdated);
    return () => {
      clearInterval(timer);
      window.removeEventListener('usage-updated', onUsageUpdated);
    };
  }, [loadUsage]);

  if (!activeSessionId || !usage || usage.llm_calls === 0) return null;

  // Group by model from records
  const byModel: Record<string, { prompt_tokens: number; completion_tokens: number; total_tokens: number; llm_calls: number }> = {};
  for (const r of usage.records) {
    if (!byModel[r.model]) {
      byModel[r.model] = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, llm_calls: 0 };
    }
    byModel[r.model].prompt_tokens += r.prompt_tokens;
    byModel[r.model].completion_tokens += r.completion_tokens;
    byModel[r.model].total_tokens += r.total_tokens;
    byModel[r.model].llm_calls += r.llm_calls;
  }
  const modelEntries = Object.entries(byModel);

  return (
    <div className={styles.usageSection}>
      <button
        className={styles.usageSummary}
        onClick={() => setExpanded(!expanded)}
        title="当前对话 Token 用量"
      >
        <span className={styles.usageIcon}>📊</span>
        <span className={styles.usageText}>
          {formatTokens(usage.total_tokens)} tokens · {usage.llm_calls} 次调用
        </span>
        <span className={styles.usageToggle}>{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className={styles.usageDetails}>
          <div className={styles.usageRow}>
            <span className={styles.usageLabel}>输入</span>
            <span className={styles.usageValue}>{formatTokens(usage.prompt_tokens)}</span>
          </div>
          <div className={styles.usageRow}>
            <span className={styles.usageLabel}>输出</span>
            <span className={styles.usageValue}>{formatTokens(usage.completion_tokens)}</span>
          </div>
          <div className={styles.usageRow}>
            <span className={styles.usageLabel}>总计</span>
            <span className={styles.usageValue}>{formatTokens(usage.total_tokens)}</span>
          </div>

          {modelEntries.length > 0 && (
            <>
              <div className={styles.usageDivider} />
              <div className={styles.usageSubtitle}>按模型</div>
              {modelEntries.map(([model, stats]) => (
                <div key={model} className={styles.usageModelRow}>
                  <span className={styles.usageModelName} title={model}>
                    {model.split('/').pop()}
                  </span>
                  <span className={styles.usageModelValue}>
                    {formatTokens(stats.total_tokens)} · {stats.llm_calls}次
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
