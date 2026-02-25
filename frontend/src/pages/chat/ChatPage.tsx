import { useUIStore } from '@/store/uiStore';
import Sidebar from './Sidebar/Sidebar';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import styles from './ChatPage.module.css';

export default function ChatPage() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  return (
    <div className={styles.chatPage}>
      <div className={`${styles.sidebar} ${sidebarCollapsed ? styles.collapsed : ''}`}>
        <Sidebar />
      </div>
      <div className={styles.chatArea}>
        {sidebarCollapsed && (
          <button
            className={styles.expandButton}
            onClick={toggleSidebar}
            title="展开侧边栏"
          >
            ☰
          </button>
        )}
        <MessageList />
        <ChatInput />
      </div>
    </div>
  );
}
