import { useUIStore } from '@/store/uiStore';
import type { TabKey } from '@/types';
import styles from './TabBar.module.css';

const tabs: { key: TabKey; label: string; icon: string }[] = [
  { key: 'chat', label: '对话', icon: '💬' },
  { key: 'usage', label: '用量', icon: '📊' },
  { key: 'config', label: '配置', icon: '⚙️' },
  { key: 'memory', label: '记忆', icon: '🧠' },
  { key: 'skills', label: 'Skill', icon: '🔧' },
];

export default function TabBar() {
  const { activeTab, setActiveTab } = useUIStore();

  return (
    <div className={styles.tabBar}>
      <div className={styles.logo}>
        <span className={styles.logoIcon}>🐈</span>
        <span className={styles.logoText}>nanobot</span>
      </div>
      <div className={styles.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`${styles.tab} ${activeTab === tab.key ? styles.active : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className={styles.tabIcon}>{tab.icon}</span>
            <span className={styles.tabLabel}>{tab.label}</span>
          </button>
        ))}
      </div>
      <div className={styles.spacer} />
    </div>
  );
}
