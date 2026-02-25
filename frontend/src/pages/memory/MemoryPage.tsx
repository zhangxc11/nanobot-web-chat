import { useState, useEffect, useCallback } from 'react';
import MarkdownRenderer from '@/components/Markdown/MarkdownRenderer';
import styles from './MemoryPage.module.css';

interface MemoryFile {
  name: string;
  size: number;
  modifiedAt: string;
}

export default function MemoryPage() {
  const [files, setFiles] = useState<MemoryFile[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/memory/files');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFiles(data.files || []);
      // Auto-select first file
      if (data.files?.length > 0 && !activeFile) {
        setActiveFile(data.files[0].name);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [activeFile]);

  const loadFileContent = useCallback(async (filename: string) => {
    setLoadingContent(true);
    try {
      const res = await fetch(`/api/memory/files/${encodeURIComponent(filename)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setContent(data.content || '');
    } catch (e) {
      setContent(`❌ 加载失败: ${e instanceof Error ? e.message : '未知错误'}`);
    } finally {
      setLoadingContent(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    if (activeFile) {
      loadFileContent(activeFile);
    }
  }, [activeFile, loadFileContent]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>❌ {error}</p>
          <button onClick={loadFiles}>重试</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span>🧠 记忆文件</span>
        </div>
        <div className={styles.fileList}>
          {files.map(file => (
            <div
              key={file.name}
              className={`${styles.fileItem} ${activeFile === file.name ? styles.active : ''}`}
              onClick={() => setActiveFile(file.name)}
            >
              <div className={styles.fileName}>📄 {file.name}</div>
              <div className={styles.fileMeta}>{formatSize(file.size)}</div>
            </div>
          ))}
          {files.length === 0 && (
            <div className={styles.empty}>暂无记忆文件</div>
          )}
        </div>
      </div>
      <div className={styles.content}>
        {activeFile ? (
          <>
            <div className={styles.contentHeader}>
              <span className={styles.contentTitle}>{activeFile}</span>
              <span className={styles.readonlyBadge}>只读</span>
            </div>
            <div className={styles.contentBody}>
              {loadingContent ? (
                <div className={styles.loading}>加载中...</div>
              ) : (
                <MarkdownRenderer content={content} />
              )}
            </div>
          </>
        ) : (
          <div className={styles.empty}>选择一个文件查看内容</div>
        )}
      </div>
    </div>
  );
}
