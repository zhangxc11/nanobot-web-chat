import { useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useSessionStore } from '@/store/sessionStore';
import SessionList from './SessionList';
import UsageIndicator from './UsageIndicator';
import styles from './Sidebar.module.css';

export default function Sidebar() {
  const { toggleSidebar } = useUIStore();
  const { fetchSessions, createSession, loading } = useSessionStore();

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleNewSession = async () => {
    const session = await createSession();
    if (session) {
      // createSession already sets it as active in the store
    }
  };

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <button className={styles.newButton} onClick={handleNewSession}>
          <span>+</span>
          <span>新建对话</span>
        </button>
      </div>
      <div className={styles.sessionList}>
        {loading ? (
          <div className={styles.emptyList}>
            <p>加载中...</p>
          </div>
        ) : (
          <SessionList />
        )}
      </div>
      <UsageIndicator />
      <div className={styles.footer}>
        <button className={styles.collapseButton} onClick={toggleSidebar}>
          <span>◀</span>
          <span>收起</span>
        </button>
      </div>
    </div>
  );
}
