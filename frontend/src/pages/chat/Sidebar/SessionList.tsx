import { useState, useRef, useEffect, useMemo } from 'react';
import { useSessionStore } from '@/store/sessionStore';
import type { Session } from '@/types';
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
    if (id.startsWith('feishu')) return '飞书对话';
    return id;
  }
  return summary;
}

// ── Channel grouping ──

interface ChannelGroup {
  key: string;
  label: string;
  icon: string;
  sessions: Session[];       // manual sessions (or all for non-webchat)
  apiSessions: Session[];    // API-created sessions (webchat only)
}

const CHANNEL_CONFIG: Record<string, { label: string; icon: string; order: number }> = {
  webchat:  { label: '网页对话', icon: '🌐', order: 0 },
  cli:      { label: '命令行',   icon: '💻', order: 1 },
  feishu:   { label: '飞书',     icon: '💬', order: 2 },
  telegram: { label: 'Telegram', icon: '✈️', order: 3 },
  discord:  { label: 'Discord',  icon: '🎮', order: 4 },
  test:     { label: '测试',     icon: '🧪', order: 5 },
  other:    { label: '其他',     icon: '📁', order: 6 },
};

/** Extract channel from sessionKey (e.g. "feishu.lab:xxx" → "feishu") */
function getChannel(sessionKey: string): string {
  if (!sessionKey) return 'other';
  const colonIdx = sessionKey.indexOf(':');
  const prefix = colonIdx > 0 ? sessionKey.substring(0, colonIdx) : sessionKey;
  // Normalize: "feishu.lab" → "feishu", "feishu.ST" → "feishu"
  const dotIdx = prefix.indexOf('.');
  const base = dotIdx > 0 ? prefix.substring(0, dotIdx) : prefix;
  return CHANNEL_CONFIG[base] ? base : 'other';
}

/** Check if a webchat session is API-created (non-numeric part after colon) */
function isApiSession(sessionKey: string): boolean {
  if (!sessionKey) return false;
  const colonIdx = sessionKey.indexOf(':');
  if (colonIdx < 0) return false;
  const suffix = sessionKey.substring(colonIdx + 1);
  // Pure numeric = manual (e.g. "webchat:1772030778")
  // Non-numeric = API-created (e.g. "webchat:dispatch_1772696251_gen1")
  return !/^\d+$/.test(suffix);
}

/** Group sessions by channel, preserving sort order within each group */
function groupSessionsByChannel(sessions: Session[]): ChannelGroup[] {
  const groupMap = new Map<string, Session[]>();

  for (const session of sessions) {
    const channel = getChannel(session.sessionKey || '');
    if (!groupMap.has(channel)) {
      groupMap.set(channel, []);
    }
    groupMap.get(channel)!.push(session);
  }

  const groups: ChannelGroup[] = [];
  for (const [key, groupSessions] of groupMap) {
    const config = CHANNEL_CONFIG[key] || CHANNEL_CONFIG.other;

    // For webchat channel, split into manual vs API sessions
    if (key === 'webchat') {
      const manual: Session[] = [];
      const api: Session[] = [];
      for (const s of groupSessions) {
        if (isApiSession(s.sessionKey || '')) {
          api.push(s);
        } else {
          manual.push(s);
        }
      }
      groups.push({
        key,
        label: config.label,
        icon: config.icon,
        sessions: manual,
        apiSessions: api,
      });
    } else {
      groups.push({
        key,
        label: config.label,
        icon: config.icon,
        sessions: groupSessions,
        apiSessions: [],
      });
    }
  }

  // Sort groups: webchat first, then by configured order
  groups.sort((a, b) => {
    const orderA = CHANNEL_CONFIG[a.key]?.order ?? 99;
    const orderB = CHANNEL_CONFIG[b.key]?.order ?? 99;
    return orderA - orderB;
  });

  return groups;
}

// ── Components ──

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

function ChannelGroupHeader({
  icon,
  label,
  count,
  collapsed,
  onToggle,
}: {
  icon: string;
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={styles.channelGroupHeader} onClick={onToggle}>
      <span className={styles.channelGroupArrow}>{collapsed ? '▸' : '▾'}</span>
      <span className={styles.channelGroupIcon}>{icon}</span>
      <span className={styles.channelGroupLabel}>{label}</span>
      <span className={styles.channelGroupCount}>{count}</span>
    </div>
  );
}

function ApiSessionSubgroup({
  sessions,
  collapsed,
  onToggle,
  activeSessionId,
  onSelect,
  onRename,
  onDelete,
}: {
  sessions: Session[];
  collapsed: boolean;
  onToggle: () => void;
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  if (sessions.length === 0) return null;
  return (
    <div className={styles.apiSubgroup}>
      <div className={styles.apiSubgroupHeader} onClick={onToggle}>
        <span className={styles.apiSubgroupArrow}>{collapsed ? '▸' : '▾'}</span>
        <span className={styles.apiSubgroupIcon}>🤖</span>
        <span className={styles.apiSubgroupLabel}>自动任务</span>
        <span className={styles.apiSubgroupCount}>{sessions.length}</span>
      </div>
      {!collapsed && (
        <div className={styles.apiSubgroupSessions}>
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
              onClick={() => onSelect(session.id)}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SessionList() {
  const { sessions, activeSessionId, setActiveSession, loading, error, fetchSessions, renameSession, deleteSession } = useSessionStore();
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [apiCollapsed, setApiCollapsed] = useState<boolean>(true); // API sessions default collapsed

  const groups = useMemo(() => groupSessionsByChannel(sessions), [sessions]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

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

  const renderSessionItem = (session: Session) => (
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
  );

  const renderGroupSessions = (group: ChannelGroup, showGroupHeader: boolean) => (
    <div key={group.key} className={styles.channelGroup}>
      {showGroupHeader && (
        <ChannelGroupHeader
          icon={group.icon}
          label={group.label}
          count={group.sessions.length + group.apiSessions.length}
          collapsed={!!collapsedGroups[group.key]}
          onToggle={() => toggleGroup(group.key)}
        />
      )}
      {(!showGroupHeader || !collapsedGroups[group.key]) && (
        <div className={styles.channelGroupSessions}>
          {group.sessions.map(renderSessionItem)}
          {group.apiSessions.length > 0 && (
            <ApiSessionSubgroup
              sessions={group.apiSessions}
              collapsed={apiCollapsed}
              onToggle={() => setApiCollapsed((prev) => !prev)}
              activeSessionId={activeSessionId}
              onSelect={setActiveSession}
              onRename={handleRename}
              onDelete={handleDelete}
            />
          )}
        </div>
      )}
    </div>
  );

  // If only one group, don't show group headers (cleaner look)
  if (groups.length === 1) {
    return (
      <div className={styles.sessionListContainer}>
        {renderGroupSessions(groups[0], false)}
      </div>
    );
  }

  return (
    <div className={styles.sessionListContainer}>
      {groups.map((group) => renderGroupSessions(group, true))}
    </div>
  );
}
