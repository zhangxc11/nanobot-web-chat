import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useSessionStore } from '@/store/sessionStore';
import type { Session } from '@/types';
import styles from './Sidebar.module.css';

// ── Helpers ──

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

function getDisplayTitle(summary: string, _sessionKey: string, id: string): string {
  if (summary === id) {
    if (id.startsWith('webchat_')) return '新对话';
    if (id.startsWith('cli_')) return 'CLI 对话';
    if (id.startsWith('telegram_')) return 'Telegram 对话';
    if (id.startsWith('feishu')) return '飞书对话';
    if (id.startsWith('subagent_')) return '🤖 子任务';
    return id;
  }
  return summary;
}

// ── Channel config ──

const CHANNEL_CONFIG: Record<string, { label: string; icon: string; order: number }> = {
  webchat:   { label: '网页对话',  icon: '🌐', order: 0 },
  cli:       { label: '命令行',    icon: '💻', order: 1 },
  feishu:    { label: '飞书',      icon: '💬', order: 2 },
  telegram:  { label: 'Telegram',  icon: '✈️', order: 3 },
  discord:   { label: 'Discord',   icon: '🎮', order: 4 },
  subagent:  { label: '子任务',    icon: '🤖', order: 5 },
  test:      { label: '测试',      icon: '🧪', order: 6 },
  other:     { label: '其他',      icon: '📁', order: 7 },
};

function getChannel(sessionKey: string): string {
  if (!sessionKey) return 'other';
  const colonIdx = sessionKey.indexOf(':');
  const prefix = colonIdx > 0 ? sessionKey.substring(0, colonIdx) : sessionKey;
  const dotIdx = prefix.indexOf('.');
  const base = dotIdx > 0 ? prefix.substring(0, dotIdx) : prefix;
  return CHANNEL_CONFIG[base] ? base : 'other';
}

// ── Tree building ──

/** A node in the session tree */
interface SessionTreeNode {
  session: Session;
  children: SessionTreeNode[];
  /** Total descendant count (not including self) */
  descendantCount: number;
}

/**
 * Resolve the parent sessionKey for a session.
 * 1. Check manual parentMap (highest priority)
 * 2. Heuristic A: subagent sessions parse parent from key
 * 3. Heuristic B: webchat API sessions — extract 10-digit timestamp, find matching parent across all channels
 * 4. Return null if no parent found (root session)
 */
function resolveParent(
  session: Session,
  parentMap: Record<string, string>,
  allSessionKeys?: Set<string>,
): string | null {
  const sk = session.sessionKey || '';
  const id = session.id || '';

  // 1. Manual override — check by sessionKey and by id
  if (parentMap[sk]) return parentMap[sk];
  if (parentMap[id]) return parentMap[id];

  // 2. Subagent heuristic: subagent:{parent_sanitized}_{8hex}
  if (sk.startsWith('subagent:')) {
    const suffix = sk.substring('subagent:'.length);
    const match = suffix.match(/^(.+)_([0-9a-f]{8})$/);
    if (match) {
      const parentSanitized = match[1];
      const underIdx = parentSanitized.indexOf('_');
      if (underIdx > 0) {
        return parentSanitized.substring(0, underIdx) + ':' + parentSanitized.substring(underIdx + 1);
      }
      return parentSanitized;
    }
  }

  // 3. Webchat API session heuristic: webchat:<role>_<10-digit-timestamp>_<detail>
  //    Extract the FIRST 10-digit timestamp, then search for parent session.
  //    Search priority:
  //      a) Exact: any session ending with :<timestamp> (e.g. webchat:1772696251, cli:1772696251)
  //      b) Suffix: any session ending with _<timestamp> (e.g. webchat:dispatch_1772696251_1772700001)
  //    This supports:
  //      - Cross-channel parents (cli:xxx, feishu.lab:xxx, webchat:xxx)
  //      - Three-level trees: master → dispatch → worker
  //        dispatch key: webchat:dispatch_<master_ts>_<dispatch_ts>
  //        worker key:   webchat:worker_<dispatch_ts>_<detail>
  //        worker extracts dispatch_ts → matches dispatch ending with _<dispatch_ts>
  if (sk.startsWith('webchat:')) {
    const suffix = sk.substring('webchat:'.length);
    // Only for API sessions (suffix contains non-digit chars)
    if (/[^0-9]/.test(suffix)) {
      const tsMatch = suffix.match(/_(\d{10})(?:_|$)/);
      if (tsMatch && allSessionKeys) {
        const ts = tsMatch[1];
        // Priority a: exact match — session ending with :<timestamp>
        for (const candidate of allSessionKeys) {
          if (candidate.endsWith(':' + ts)) {
            return candidate;
          }
        }
        // Priority b: suffix match — session ending with _<timestamp>
        // This enables three-level trees (worker → dispatch)
        for (const candidate of allSessionKeys) {
          if (candidate !== sk && candidate.endsWith('_' + ts)) {
            return candidate;
          }
        }
      }
    }
  }

  return null;
}

/**
 * Build the full session tree.
 * Returns: { roots, childMap, descendantCount }
 *   - roots: sessions that have no parent (or parent not found)
 *   - childMap: sessionKey → direct children SessionTreeNodes
 *   - descendantCount: sessionKey → total descendant count
 */
function buildSessionTree(
  sessions: Session[],
  parentMap: Record<string, string>,
): {
  roots: SessionTreeNode[];
  nodeByKey: Map<string, SessionTreeNode>;
} {
  // Build lookup by sessionKey AND by id
  const sessionByKey = new Map<string, Session>();
  const allSessionKeys = new Set<string>();
  for (const s of sessions) {
    if (s.sessionKey) {
      sessionByKey.set(s.sessionKey, s);
      allSessionKeys.add(s.sessionKey);
    }
    sessionByKey.set(s.id, s);
  }

  // Create tree nodes
  const nodeByKey = new Map<string, SessionTreeNode>();
  for (const s of sessions) {
    const key = s.sessionKey || s.id;
    if (!nodeByKey.has(key)) {
      nodeByKey.set(key, { session: s, children: [], descendantCount: 0 });
    }
  }

  // Assign children
  const childSessionKeys = new Set<string>();
  for (const s of sessions) {
    const parentKey = resolveParent(s, parentMap, allSessionKeys);
    if (!parentKey) continue;

    const parentNode = nodeByKey.get(parentKey);
    const childKey = s.sessionKey || s.id;
    const childNode = nodeByKey.get(childKey);
    if (parentNode && childNode && parentNode !== childNode) {
      parentNode.children.push(childNode);
      childSessionKeys.add(childKey);
    }
  }

  // Compute descendant counts (bottom-up)
  function computeDescendants(node: SessionTreeNode): number {
    let count = 0;
    for (const child of node.children) {
      count += 1 + computeDescendants(child);
    }
    node.descendantCount = count;
    return count;
  }

  // Roots = sessions not assigned as children
  const roots: SessionTreeNode[] = [];
  for (const s of sessions) {
    const key = s.sessionKey || s.id;
    if (!childSessionKeys.has(key)) {
      const node = nodeByKey.get(key);
      if (node) roots.push(node);
    }
  }

  // Sort children by lastActiveAt descending
  function sortChildren(node: SessionTreeNode) {
    node.children.sort((a, b) =>
      (b.session.lastActiveAt || '').localeCompare(a.session.lastActiveAt || '')
    );
    for (const child of node.children) sortChildren(child);
  }

  for (const root of roots) {
    computeDescendants(root);
    sortChildren(root);
  }

  return { roots, nodeByKey };
}

// ── Group roots by channel ──

interface ChannelGroup {
  key: string;
  label: string;
  icon: string;
  roots: SessionTreeNode[];
}

function groupByChannel(roots: SessionTreeNode[]): ChannelGroup[] {
  const groupMap = new Map<string, SessionTreeNode[]>();

  for (const node of roots) {
    const ch = getChannel(node.session.sessionKey || '');
    if (!groupMap.has(ch)) groupMap.set(ch, []);
    groupMap.get(ch)!.push(node);
  }

  const groups: ChannelGroup[] = [];
  for (const [key, nodes] of groupMap) {
    const config = CHANNEL_CONFIG[key] || CHANNEL_CONFIG.other;
    groups.push({ key, label: config.label, icon: config.icon, roots: nodes });
  }

  groups.sort((a, b) => {
    const orderA = CHANNEL_CONFIG[a.key]?.order ?? 99;
    const orderB = CHANNEL_CONFIG[b.key]?.order ?? 99;
    return orderA - orderB;
  });

  return groups;
}

// ── Components ──

interface SessionItemProps {
  id: string;
  summary: string;
  filename: string;
  sessionKey: string;
  lastActiveAt: string;
  messageCount: number;
  isActive: boolean;
  isDone: boolean;
  descendantCount: number;
  onClick: () => void;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
  onToggleDone: () => void;
}

function SessionItem({
  id, summary, filename, sessionKey, lastActiveAt,
  isActive, isDone, descendantCount, onClick, onRename, onDelete, onToggleDone,
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
    if (e.key === 'Enter') handleConfirm();
    else if (e.key === 'Escape') { setEditing(false); setEditValue(summary); }
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
      className={`${styles.sessionItem} ${isActive ? styles.sessionActive : ''} ${isDone ? styles.sessionDone : ''}`}
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
          <div className={styles.sessionSummary}>
            {isDone && <span className={styles.doneIcon}>✅</span>}
            <span className={styles.sessionSummaryText}>{displayTitle}</span>
            {descendantCount > 0 && (
              <span className={styles.childBadge}>{descendantCount}</span>
            )}
          </div>
        )}
        {!editing && (
          <div className={styles.sessionActions}>
            <button
              className={`${styles.sessionDoneBtn} ${isDone ? styles.sessionDoneBtnActive : ''}`}
              onClick={(e) => { e.stopPropagation(); onToggleDone(); }}
              title={isDone ? '取消完成' : '标记完成'}
            >
              ✓
            </button>
            <button
              className={styles.sessionDeleteBtn}
              onClick={handleDeleteClick}
              title="删除对话"
            >
              ×
            </button>
          </div>
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

/** Inline children panel shown below the active parent session */
function ChildrenPanel({
  children,
  depth,
  expandedKeys,
  tagsMap,
  onToggle,
  activeSessionId,
  onSelect,
  onRename,
  onDelete,
  onToggleDone,
}: {
  children: SessionTreeNode[];
  depth: number;
  expandedKeys: Record<string, boolean>;
  tagsMap: Record<string, string[]>;
  onToggle: (key: string) => void;
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onToggleDone: (session: Session) => void;
}) {
  if (children.length === 0) return null;

  const indent = 12 + depth * 10;

  return (
    <div className={styles.childrenPanel} style={{ paddingLeft: indent }}>
      {children.map((child) => {
        const ck = child.session.sessionKey || child.session.id;
        const isActive = child.session.id === activeSessionId;
        const isExpanded = expandedKeys[ck] === true;
        const hasChildren = child.children.length > 0;
        const childIsDone = (tagsMap[ck] || []).includes('done');

        return (
          <div key={ck} className={styles.childNodeWrapper}>
            <div className={styles.childNodeRow}>
              {hasChildren ? (
                <button
                  className={styles.childExpandBtn}
                  onClick={(e) => { e.stopPropagation(); onToggle(ck); }}
                >
                  {isExpanded ? '▾' : '▸'}
                </button>
              ) : (
                <span className={styles.childExpandPlaceholder}>·</span>
              )}
              <div
                className={`${styles.childItem} ${isActive ? styles.childItemActive : ''} ${childIsDone ? styles.childItemDone : ''}`}
                onClick={() => onSelect(child.session.id)}
                title={child.session.sessionKey}
              >
                {childIsDone && <span className={styles.doneIconSmall}>✅</span>}
                <span className={styles.childItemTitle}>
                  {getDisplayTitle(child.session.summary, child.session.sessionKey || '', child.session.id)}
                </span>
                {child.descendantCount > 0 && (
                  <span className={styles.childBadge}>{child.descendantCount}</span>
                )}
                <span className={styles.childItemTime}>{formatTime(child.session.lastActiveAt)}</span>
              </div>
            </div>
            {hasChildren && isExpanded && (
              <ChildrenPanel
                children={child.children}
                depth={depth + 1}
                expandedKeys={expandedKeys}
                tagsMap={tagsMap}
                onToggle={onToggle}
                activeSessionId={activeSessionId}
                onSelect={onSelect}
                onRename={onRename}
                onDelete={onDelete}
                onToggleDone={onToggleDone}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A session tree node: session item + optional inline children below */
function SessionTreeItem({
  node,
  activeSessionId,
  expandedKeys,
  tagsMap,
  onToggleExpand,
  onSelect,
  onRename,
  onDelete,
  onToggleDone,
}: {
  node: SessionTreeNode;
  activeSessionId: string | null;
  expandedKeys: Record<string, boolean>;
  tagsMap: Record<string, string[]>;
  onToggleExpand: (key: string) => void;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onToggleDone: (session: Session) => void;
}) {
  const sk = node.session.sessionKey || node.session.id;
  const isActive = node.session.id === activeSessionId;
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedKeys[sk] === true;
  const isDone = (tagsMap[sk] || []).includes('done');

  // Show children panel if: this node is active OR explicitly expanded
  const showChildren = hasChildren && (isActive || isExpanded);

  return (
    <div>
      <div className={styles.treeNodeRow}>
        <SessionItem
          id={node.session.id}
          summary={node.session.summary}
          filename={node.session.filename || node.session.id + '.jsonl'}
          sessionKey={node.session.sessionKey || ''}
          lastActiveAt={node.session.lastActiveAt}
          messageCount={node.session.messageCount}
          isActive={isActive}
          isDone={isDone}
          descendantCount={node.descendantCount}
          onClick={() => onSelect(node.session.id)}
          onRename={onRename}
          onDelete={onDelete}
          onToggleDone={() => onToggleDone(node.session)}
        />
      </div>
      {showChildren && (
        <div className={styles.treeChildrenContainer}>
          <div
            className={styles.treeChildrenToggle}
            onClick={() => onToggleExpand(sk)}
          >
            <span className={styles.treeChildrenArrow}>{isExpanded ? '▾' : '▸'}</span>
            <span className={styles.treeChildrenLabel}>
              {isExpanded ? '收起' : '展开'} {node.descendantCount} 个子 session
            </span>
          </div>
          {isExpanded && (
            <ChildrenPanel
              children={node.children}
              depth={0}
              expandedKeys={expandedKeys}
              tagsMap={tagsMap}
              onToggle={onToggleExpand}
              activeSessionId={activeSessionId}
              onSelect={onSelect}
              onRename={onRename}
              onDelete={onDelete}
              onToggleDone={onToggleDone}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ChannelGroupHeader({
  icon, label, count, collapsed, onToggle,
}: {
  icon: string; label: string; count: number; collapsed: boolean; onToggle: () => void;
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

// ── Main Component ──

export default function SessionList() {
  const { sessions, parentMap, tagsMap, hideDone, activeSessionId, setActiveSession, loading, error, fetchSessions, renameSession, deleteSession, toggleDone } = useSessionStore();
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  // Build tree
  const { roots } = useMemo(
    () => buildSessionTree(sessions, parentMap),
    [sessions, parentMap],
  );

  // Filter out "done" root sessions when hideDone is on
  const filteredRoots = useMemo(() => {
    if (!hideDone) return roots;
    return roots.filter((node) => {
      const key = node.session.sessionKey || node.session.id;
      const tags = tagsMap[key] || [];
      return !tags.includes('done');
    });
  }, [roots, hideDone, tagsMap]);

  // Group roots by channel
  const groups = useMemo(() => groupByChannel(filteredRoots), [filteredRoots]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleExpand = useCallback((key: string) => {
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleRename = async (id: string, newName: string) => {
    await renameSession(id, newName);
  };

  const handleDelete = async (id: string) => {
    await deleteSession(id);
  };

  if (loading && sessions.length === 0) {
    return <div className={styles.emptyList}><p>加载中...</p></div>;
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
    return <div className={styles.emptyList}><p>暂无对话</p></div>;
  }

  const renderGroup = (group: ChannelGroup, showHeader: boolean) => {
    // Total count: only root sessions (not counting children)
    const totalCount = group.roots.length;

    return (
      <div key={group.key} className={styles.channelGroup}>
        {showHeader && (
          <ChannelGroupHeader
            icon={group.icon}
            label={group.label}
            count={totalCount}
            collapsed={!!collapsedGroups[group.key]}
            onToggle={() => toggleGroup(group.key)}
          />
        )}
        {(!showHeader || !collapsedGroups[group.key]) && (
          <div className={styles.channelGroupSessions}>
            {group.roots.map((node) => (
              <SessionTreeItem
                key={node.session.sessionKey || node.session.id}
                node={node}
                activeSessionId={activeSessionId}
                expandedKeys={expandedKeys}
                tagsMap={tagsMap}
                onToggleExpand={toggleExpand}
                onSelect={setActiveSession}
                onRename={handleRename}
                onDelete={handleDelete}
                onToggleDone={toggleDone}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  if (groups.length === 1) {
    return (
      <div className={styles.sessionListContainer}>
        {renderGroup(groups[0], false)}
      </div>
    );
  }

  return (
    <div className={styles.sessionListContainer}>
      {groups.map((group) => renderGroup(group, true))}
    </div>
  );
}
