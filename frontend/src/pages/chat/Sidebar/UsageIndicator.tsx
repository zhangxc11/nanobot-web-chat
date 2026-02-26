import { useState, useEffect, useCallback } from 'react';
import * as api from '@/services/api';
import styles from './Sidebar.module.css';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function UsageIndicator() {
  const [usage, setUsage] = useState<api.UsageStats | null>(null);
  const [expanded, setExpanded] = useState(false);

  const loadUsage = useCallback(async () => {
    try {
      const data = await api.fetchUsage();
      setUsage(data);
    } catch {
      // Silently fail — usage is non-critical
    }
  }, []);

  useEffect(() => {
    loadUsage();
    // Refresh every 60 seconds
    const timer = setInterval(loadUsage, 60_000);
    return () => clearInterval(timer);
  }, [loadUsage]);

  if (!usage || usage.total_llm_calls === 0) return null;

  const modelEntries = Object.entries(usage.by_model);

  return (
    <div className={styles.usageSection}>
      <button
        className={styles.usageSummary}
        onClick={() => setExpanded(!expanded)}
        title="Token 用量统计"
      >
        <span className={styles.usageIcon}>📊</span>
        <span className={styles.usageText}>
          {formatTokens(usage.total_tokens)} tokens · {usage.total_llm_calls} 次调用
        </span>
        <span className={styles.usageToggle}>{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className={styles.usageDetails}>
          <div className={styles.usageRow}>
            <span className={styles.usageLabel}>输入</span>
            <span className={styles.usageValue}>{formatTokens(usage.total_prompt_tokens)}</span>
          </div>
          <div className={styles.usageRow}>
            <span className={styles.usageLabel}>输出</span>
            <span className={styles.usageValue}>{formatTokens(usage.total_completion_tokens)}</span>
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
