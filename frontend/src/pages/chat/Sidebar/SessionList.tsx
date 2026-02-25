import { useSessionStore } from '@/store/sessionStore';
import styles from './Sidebar.module.css';

interface SessionItemProps {
  id: string;
  summary: string;
  lastActiveAt: string;
  messageCount: number;
  isActive: boolean;
  onClick: () => void;
}

function formatTime(isoStr: string): string {
  if (!isoStr) return '';
  try {
    const date = new Date(isoStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function SessionItem({ summary, lastActiveAt, isActive, onClick }: SessionItemProps) {
  return (
    <div
      className={`${styles.sessionItem} ${isActive ? styles.sessionActive : ''}`}
      onClick={onClick}
    >
      <div className={styles.sessionSummary}>{summary}</div>
      <div className={styles.sessionMeta}>
        <span className={styles.sessionTime}>{formatTime(lastActiveAt)}</span>
      </div>
    </div>
  );
}

export default function SessionList() {
  const { sessions, activeSessionId, setActiveSession, loading, error, fetchSessions } = useSessionStore();

  if (loading && sessions.length === 0) {
    return (
      <div className={styles.emptyList}>
        <p>加载中...</p>
      </div>
    );
  }

  if (error && sessions.length === 0) {
    return (
      <div className={styles.emptyList}>
        <p style={{ color: '#ff4d4f' }}>⚠️ {error}</p>
        <button className={styles.retryBtn} onClick={fetchSessions}>重试</button>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className={styles.emptyList}>
        <p>暂无对话</p>
      </div>
    );
  }

  return (
    <div className={styles.sessionListContainer}>
      {sessions.map((session) => (
        <SessionItem
          key={session.id}
          id={session.id}
          summary={session.summary}
          lastActiveAt={session.lastActiveAt}
          messageCount={session.messageCount}
          isActive={session.id === activeSessionId}
          onClick={() => setActiveSession(session.id)}
        />
      ))}
    </div>
  );
}
