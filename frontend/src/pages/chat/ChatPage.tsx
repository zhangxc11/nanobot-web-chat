import { useUIStore } from '@/store/uiStore';
import Sidebar from './Sidebar/Sidebar';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import styles from './ChatPage.module.css';

export default function ChatPage() {
  const { sidebarCollapsed } = useUIStore();

  return (
    <div className={styles.chatPage}>
      <div className={`${styles.sidebar} ${sidebarCollapsed ? styles.collapsed : ''}`}>
        <Sidebar />
      </div>
      <div className={styles.chatArea}>
        <MessageList />
        <ChatInput />
      </div>
    </div>
  );
}
