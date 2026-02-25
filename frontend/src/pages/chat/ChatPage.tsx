import { useUIStore } from '@/store/uiStore';
import Sidebar from './Sidebar/Sidebar';
import styles from './ChatPage.module.css';

export default function ChatPage() {
  const { sidebarCollapsed } = useUIStore();

  return (
    <div className={styles.chatPage}>
      <div className={`${styles.sidebar} ${sidebarCollapsed ? styles.collapsed : ''}`}>
        <Sidebar />
      </div>
      <div className={styles.chatArea}>
        <div className={styles.messages}>
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>💬</span>
            <p>选择一个对话或创建新对话开始聊天</p>
          </div>
        </div>
        <div className={styles.inputArea}>
          <div className={styles.inputWrapper}>
            <textarea
              className={styles.input}
              placeholder="输入消息..."
              rows={1}
              disabled
            />
            <button className={styles.sendButton} disabled>
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
