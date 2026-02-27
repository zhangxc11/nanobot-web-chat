import { useEffect, useState, useCallback, useRef } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useSessionStore } from '@/store/sessionStore';
import * as api from '@/services/api';
import SessionList from './SessionList';
import UsageIndicator from './UsageIndicator';
import styles from './Sidebar.module.css';

export default function Sidebar() {
  const { toggleSidebar } = useUIStore();
  const { fetchSessions, createSession, setActiveSession, loading } = useSessionStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<api.SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleNewSession = async () => {
    setSearchQuery('');
    setSearchResults(null);
    const session = await createSession();
    if (session) {
      // createSession already sets it as active in the store
    }
  };

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!query.trim()) {
      setSearchResults(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await api.searchSessions(query.trim());
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      }
      setSearching(false);
    }, 300); // debounce 300ms
  }, []);

  const handleSearchResultClick = (id: string) => {
    setActiveSession(id);
    setSearchQuery('');
    setSearchResults(null);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <button className={styles.newButton} onClick={handleNewSession}>
          <span>+</span>
          <span>新建对话</span>
        </button>
        <div className={styles.searchBox}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="搜索对话..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {searchQuery && (
            <button className={styles.searchClear} onClick={handleClearSearch}>×</button>
          )}
        </div>
      </div>
      <div className={styles.sessionList}>
        {searchResults !== null ? (
          <div className={styles.searchResults}>
            {searching ? (
              <div className={styles.searchStatus}>搜索中...</div>
            ) : searchResults.length === 0 ? (
              <div className={styles.searchStatus}>无匹配结果</div>
            ) : (
              searchResults.map((result) => (
                <div
                  key={result.id}
                  className={styles.searchResultItem}
                  onClick={() => handleSearchResultClick(result.id)}
                >
                  <div className={styles.searchResultTitle}>{result.summary}</div>
                  {result.matches.length > 0 && (
                    <div className={styles.searchResultMatches}>
                      {result.matches.map((m, i) => (
                        <div key={i} className={styles.searchResultMatch}>
                          💬 {m}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className={styles.searchResultFilename}>{result.filename}</div>
                </div>
              ))
            )}
          </div>
        ) : loading ? (
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
