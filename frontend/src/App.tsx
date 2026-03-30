import { useUIStore } from '@/store/uiStore';
import TabBar from '@/components/TabBar/TabBar';
import ChatPage from '@/pages/chat/ChatPage';
import UsagePage from '@/pages/usage/UsagePage';
import ConfigPage from '@/pages/config/ConfigPage';
import MemoryPage from '@/pages/memory/MemoryPage';
import SkillsPage from '@/pages/skills/SkillsPage';
import CronPage from '@/pages/cron/CronPage';
import styles from './App.module.css';

function App() {
  const { activeTab } = useUIStore();

  const renderModule = () => {
    switch (activeTab) {
      case 'chat':
        return <ChatPage />;
      case 'usage':
        return <UsagePage />;
      case 'config':
        return <ConfigPage />;
      case 'memory':
        return <MemoryPage />;
      case 'skills':
        return <SkillsPage />;
      case 'cron':
        return <CronPage />;
      default:
        return <ChatPage />;
    }
  };

  return (
    <div className={styles.app}>
      <TabBar />
      <div className={styles.content}>
        {renderModule()}
      </div>
    </div>
  );
}

export default App;
