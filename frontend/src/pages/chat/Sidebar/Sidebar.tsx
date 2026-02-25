import { useUIStore } from '@/store/uiStore';
import styles from './Sidebar.module.css';

export default function Sidebar() {
  const { toggleSidebar } = useUIStore();

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <button className={styles.newButton}>
          <span>+</span>
          <span>新建对话</span>
        </button>
      </div>
      <div className={styles.sessionList}>
        {/* Session 列表将在 Phase 2 实现 */}
        <div className={styles.emptyList}>
          <p>暂无对话</p>
        </div>
      </div>
      <div className={styles.footer}>
        <button className={styles.collapseButton} onClick={toggleSidebar}>
          <span>◀</span>
          <span>收起</span>
        </button>
      </div>
    </div>
  );
}
