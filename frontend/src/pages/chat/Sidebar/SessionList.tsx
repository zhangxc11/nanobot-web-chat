import { useState, useRef, useEffect } from 'react';
import { useSessionStore } from '@/store/sessionStore';
import styles from './Sidebar.module.css';

interface SessionItemProps {
  id: string;
  summary: string;
  filename: string;
  sessionKey: string;
  lastActiveAt: string;
  messageCount: number;
  isActive: boolean;
  onClick: () => void;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
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

/** Generate a display title for the session */
function getDisplayTitle(summary: string, _sessionKey: string, id: string): string {
  // If summary is just the session id (no custom name, no user message), use a friendlier name
  if (summary === id) {
    // webchat_1772030778 → "网页对话"
    if (id.startsWith('webchat_')) return '新对话';
    if (id.startsWith('cli_')) return 'CLI 对话';
    if (id.startsWith('telegram_')) return 'Telegram 对话';
    return id;
  }
  return summary;
}

function SessionItem({
  id, summary, filename, sessionKey, lastActiveAt,
  isActive, onClick, onRename, onDelete,
}: SessionItemProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(summary);
  const [showConfirm, setShowConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(summary);
    setEditing(true);
  };

  const handleConfirm = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== summary) {
      onRename(id, trimmed);
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      setEditing(false);
      setEditValue(summary);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowConfirm(true);
  };

  const handleDeleteConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowConfirm(false);
    onDelete(id);
  };

  const handleDeleteCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowConfirm(false);
  };

  const displayTitle = getDisplayTitle(summary, sessionKey, id);

  return (
    <div
      className={`${styles.sessionItem} ${isActive ? styles.sessionActive : ''}`}
      onClick={onClick}
      onDoubleClick={handleDoubleClick}
      title="双击编辑名称"
    >
      <div className={styles.sessionTopRow}>
        {editing ? (
          <input
            ref={inputRef}
            className={styles.sessionEditInput}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleConfirm}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div className={styles.sessionSummary}>{displayTitle}</div>
        )}
        {!editing && (
          <button
            className={styles.sessionDeleteBtn}
            onClick={handleDeleteClick}
            title="删除对话"
          >
            ×
          </button>
        )}
      </div>
      {showConfirm && (
        <div className={styles.deleteConfirm} onClick={(e) => e.stopPropagation()}>
          <span className={styles.deleteConfirmText}>确认删除？</span>
          <button className={styles.deleteConfirmYes} onClick={handleDeleteConfirm}>删除</button>
          <button className={styles.deleteConfirmNo} onClick={handleDeleteCancel}>取消</button>
        </div>
      )}
      <div className={styles.sessionMeta}>
        <span className={styles.sessionFilename}>{filename}</span>
        <span className={styles.sessionTime}>{formatTime(lastActiveAt)}</span>
      </div>
    </div>
  );
}

export default function SessionList() {
  const { sessions, activeSessionId, setActiveSession, loading, error, fetchSessions, renameSession, deleteSession } = useSessionStore();

  const handleRename = async (id: string, newName: string) => {
    await renameSession(id, newName);
  };

  const handleDelete = async (id: string) => {
    await deleteSession(id);
  };

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
          filename={session.filename || session.id + '.jsonl'}
          sessionKey={session.sessionKey || ''}
          lastActiveAt={session.lastActiveAt}
          messageCount={session.messageCount}
          isActive={session.id === activeSessionId}
          onClick={() => setActiveSession(session.id)}
          onRename={handleRename}
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
}
