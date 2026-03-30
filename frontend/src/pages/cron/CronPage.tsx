import { useState, useEffect, useCallback } from 'react';
import styles from './CronPage.module.css';
import { fetchCronJobs, createCronJob, deleteCronJob, toggleCronJob, runCronJob } from '@/services/api';

interface CronJobSchedule {
  kind: string;
  expr?: string;
  tz?: string;
  atMs?: number;
  everyMs?: number;
}

interface CronJobState {
  nextRunAtMs?: number;
  lastRunAtMs?: number;
  lastStatus?: string;
  lastError?: string;
}

interface CronJob {
  id: string;
  name: string;
  enabled: boolean;
  schedule: CronJobSchedule;
  message: string;
  targetSession?: string;
  sourceChannel?: string;
  deleteAfterRun: boolean;
  state: CronJobState;
  createdAtMs: number;
}

function formatTime(ms?: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const absDiff = Math.abs(diffMs);

  let relative = '';
  if (absDiff < 60000) relative = '刚刚';
  else if (absDiff < 3600000) relative = `${Math.floor(absDiff / 60000)}分钟`;
  else if (absDiff < 86400000) relative = `${Math.floor(absDiff / 3600000)}小时`;
  else relative = `${Math.floor(absDiff / 86400000)}天`;

  if (diffMs > 0) relative += '后';
  else if (absDiff >= 60000) relative += '前';

  const timeStr = d.toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  });
  return `${timeStr} (${relative})`;
}

function formatSchedule(s: CronJobSchedule): string {
  if (s.kind === 'cron') return `cron: ${s.expr}${s.tz ? ` (${s.tz})` : ''}`;
  if (s.kind === 'every') {
    const sec = (s.everyMs || 0) / 1000;
    if (sec >= 3600) return `每 ${Math.floor(sec / 3600)} 小时`;
    if (sec >= 60) return `每 ${Math.floor(sec / 60)} 分钟`;
    return `每 ${sec} 秒`;
  }
  if (s.kind === 'at') return `一次性: ${formatTime(s.atMs)}`;
  return s.kind || '未知';
}

export default function CronPage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Create form state
  const [formName, setFormName] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formType, setFormType] = useState<'cron' | 'every' | 'at'>('cron');
  const [formCronExpr, setFormCronExpr] = useState('');
  const [formTz, setFormTz] = useState('');
  const [formEverySeconds, setFormEverySeconds] = useState('');
  const [formAtTime, setFormAtTime] = useState('');
  const [createError, setCreateError] = useState('');

  const loadJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await fetchCronJobs();
      setJobs(data.jobs || []);
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确认删除定时任务 "${name}" (${id})？`)) return;
    setActionLoading(id);
    try {
      await deleteCronJob(id);
      await loadJobs();
    } catch (e: any) {
      alert(`删除失败: ${e.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggle = async (id: string, currentEnabled: boolean) => {
    setActionLoading(id);
    try {
      await toggleCronJob(id, !currentEnabled);
      await loadJobs();
    } catch (e: any) {
      alert(`操作失败: ${e.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRun = async (id: string) => {
    setActionLoading(id);
    try {
      await runCronJob(id);
      alert('已触发执行');
      await loadJobs();
    } catch (e: any) {
      alert(`执行失败: ${e.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreate = async () => {
    setCreateError('');
    if (!formName.trim() || !formMessage.trim()) {
      setCreateError('名称和消息不能为空');
      return;
    }
    setActionLoading('create');
    try {
      await createCronJob({
        name: formName.trim(),
        message: formMessage.trim(),
        scheduleType: formType,
        cronExpr: formCronExpr.trim(),
        tz: formTz.trim(),
        everySeconds: formEverySeconds ? parseInt(formEverySeconds) : undefined,
        atTime: formAtTime.trim(),
      });
      setShowCreate(false);
      setFormName('');
      setFormMessage('');
      setFormCronExpr('');
      setFormTz('');
      setFormEverySeconds('');
      setFormAtTime('');
      await loadJobs();
    } catch (e: any) {
      setCreateError(e.message || '创建失败');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>⏰ 定时任务</h2>
        <div className={styles.headerActions}>
          <button className={styles.refreshBtn} onClick={loadJobs} disabled={loading}>
            🔄
          </button>
          <button className={styles.createBtn} onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? '取消' : '+ 新建'}
          </button>
        </div>
      </div>

      {showCreate && (
        <div className={styles.createForm}>
          <div className={styles.formRow}>
            <label>名称</label>
            <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="任务名称" />
          </div>
          <div className={styles.formRow}>
            <label>消息</label>
            <textarea value={formMessage} onChange={e => setFormMessage(e.target.value)} placeholder="触发时发送的消息" rows={3} />
          </div>
          <div className={styles.formRow}>
            <label>调度类型</label>
            <div className={styles.typeSelector}>
              {(['cron', 'every', 'at'] as const).map(t => (
                <button key={t} className={`${styles.typeBtn} ${formType === t ? styles.typeBtnActive : ''}`}
                  onClick={() => setFormType(t)}>
                  {t === 'cron' ? 'Cron 表达式' : t === 'every' ? '固定间隔' : '一次性'}
                </button>
              ))}
            </div>
          </div>
          {formType === 'cron' && (
            <>
              <div className={styles.formRow}>
                <label>Cron 表达式</label>
                <input value={formCronExpr} onChange={e => setFormCronExpr(e.target.value)} placeholder="0 9 * * * (每天9点)" />
              </div>
              <div className={styles.formRow}>
                <label>时区 (可选)</label>
                <input value={formTz} onChange={e => setFormTz(e.target.value)} placeholder="Asia/Shanghai" />
              </div>
            </>
          )}
          {formType === 'every' && (
            <div className={styles.formRow}>
              <label>间隔 (秒)</label>
              <input type="number" value={formEverySeconds} onChange={e => setFormEverySeconds(e.target.value)} placeholder="1800 (30分钟)" />
            </div>
          )}
          {formType === 'at' && (
            <div className={styles.formRow}>
              <label>执行时间</label>
              <input value={formAtTime} onChange={e => setFormAtTime(e.target.value)} placeholder="2026-03-31T10:00:00" />
            </div>
          )}
          {createError && <div className={styles.errorMsg}>{createError}</div>}
          <button className={styles.submitBtn} onClick={handleCreate} disabled={actionLoading === 'create'}>
            {actionLoading === 'create' ? '创建中...' : '创建任务'}
          </button>
        </div>
      )}

      {error && <div className={styles.errorMsg}>{error}</div>}

      {loading ? (
        <div className={styles.loading}>加载中...</div>
      ) : jobs.length === 0 ? (
        <div className={styles.empty}>暂无定时任务</div>
      ) : (
        <div className={styles.jobList}>
          {jobs.map(job => (
            <div key={job.id} className={`${styles.jobCard} ${!job.enabled ? styles.jobDisabled : ''}`}>
              <div className={styles.jobHeader}>
                <div className={styles.jobTitle}>
                  <span className={styles.jobName}>{job.name}</span>
                  <span className={styles.jobId}>{job.id}</span>
                  {!job.enabled && <span className={styles.disabledBadge}>已禁用</span>}
                  {job.deleteAfterRun && <span className={styles.onceBadge}>一次性</span>}
                </div>
                <div className={styles.jobActions}>
                  <button
                    className={styles.actionBtn}
                    onClick={() => handleToggle(job.id, job.enabled)}
                    disabled={actionLoading === job.id}
                    title={job.enabled ? '禁用' : '启用'}
                  >
                    {job.enabled ? '⏸' : '▶️'}
                  </button>
                  <button
                    className={styles.actionBtn}
                    onClick={() => handleRun(job.id)}
                    disabled={actionLoading === job.id || !job.enabled}
                    title="立即执行"
                  >
                    🚀
                  </button>
                  <button
                    className={`${styles.actionBtn} ${styles.deleteBtn}`}
                    onClick={() => handleDelete(job.id, job.name)}
                    disabled={actionLoading === job.id}
                    title="删除"
                  >
                    🗑
                  </button>
                </div>
              </div>
              <div className={styles.jobSchedule}>{formatSchedule(job.schedule)}</div>
              <div className={styles.jobMessage}>{job.message}</div>
              <div className={styles.jobMeta}>
                <span>下次: {formatTime(job.state.nextRunAtMs)}</span>
                <span>上次: {formatTime(job.state.lastRunAtMs)}</span>
                {job.state.lastStatus && (
                  <span className={job.state.lastStatus === 'ok' ? styles.statusOk : styles.statusError}>
                    {job.state.lastStatus}
                  </span>
                )}
              </div>
              {job.state.lastError && (
                <div className={styles.jobError}>❌ {job.state.lastError}</div>
              )}
              {(job.targetSession || job.sourceChannel) && (
                <div className={styles.jobTarget}>
                  {job.targetSession && <span>目标: {job.targetSession}</span>}
                  {job.sourceChannel && <span>来源: {job.sourceChannel}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
