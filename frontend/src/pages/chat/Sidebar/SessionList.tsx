import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useSessionStore } from '@/store/sessionStore';
import { useRunningSessions } from '@/hooks/useRunningSessions';
import { useSubagentStatus } from '@/hooks/useSubagentStatus';
import type { SubagentInfo } from '@/services/api';
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

/**
 * Extract channel from session id (filename without .jsonl).
 * Examples:
 *   webchat_1772944924         → webchat
 *   feishu.lab.1772376517      → feishu
 *   feishu.lab_ou_b0cea..._xxx → feishu
 *   subagent_webchat_xxx       → subagent
 *   cli_xxx                    → cli
 */
function getChannel(sessionId: string): string {
  if (!sessionId) return 'other';
  // Find the first separator: either '_' or '.'
  const underIdx = sessionId.indexOf('_');
  const dotIdx = sessionId.indexOf('.');
  let prefix: string;
  if (underIdx < 0 && dotIdx < 0) {
    prefix = sessionId;
  } else if (underIdx < 0) {
    prefix = sessionId.substring(0, dotIdx);
  } else if (dotIdx < 0) {
    prefix = sessionId.substring(0, underIdx);
  } else {
    prefix = sessionId.substring(0, Math.min(underIdx, dotIdx));
  }
  return CHANNEL_CONFIG[prefix] ? prefix : 'other';
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
 * Resolve the parent session id for a session.
 * All lookups are based on session.id (filename without .jsonl), which is globally unique.
 *
 * 1. Check manual parentMap (highest priority) — now keyed by id
 * 2. Heuristic A: subagent sessions parse parent from id
 *    id format: subagent_{parent_channel}_{parent_payload}_{8hex}
 *    e.g. subagent_webchat_1772696251_abc12345 → parent id: webchat_1772696251
 * 3. Heuristic B: webchat API sessions — extract 10-digit timestamp, find matching parent
 *    Search priority:
 *      a) Exact: any session id matching {channel}_{timestamp} (e.g. webchat_1772696251, cli_1772696251)
 *      b) Suffix: any session id ending with _{timestamp} (e.g. webchat_dispatch_1772696251_1772700001)
 * 4. Return null if no parent found (root session)
 */
function resolveParent(
  session: Session,
  parentMap: Record<string, string>,
  allSessionIds?: Set<string>,
): string | null {
  const id = session.id || '';

  // 1. Manual override — check by id
  if (parentMap[id]) return parentMap[id];

  // 2. Subagent heuristic: subagent_{parent_sanitized}_{8hex}
  //    In id format, the channel separator is '_' (not ':').
  //    subagent_webchat_1772696251_abc12345 → parent: webchat_1772696251
  if (id.startsWith('subagent_')) {
    const suffix = id.substring('subagent_'.length);
    const match = suffix.match(/^(.+)_([0-9a-f]{8})$/);
    if (match) {
      const parentId = match[1]; // e.g. webchat_1772696251
      // Verify parent exists in loaded sessions
      if (allSessionIds && allSessionIds.has(parentId)) {
        return parentId;
      }
      // If not found directly, return anyway (parentMap may have it)
      return parentId;
    }
  }

  // 3. Webchat API session heuristic: webchat_<role>_<10-digit-timestamp>_<detail>
  //    Extract the FIRST 10-digit timestamp, then search for parent session.
  //    Search priority:
  //      a) Exact: any session id matching {channel}_{timestamp} pattern
  //         (e.g. webchat_1772696251, cli_1772696251)
  //      b) Suffix: any session id ending with _{timestamp}
  //         (e.g. webchat_dispatch_1772696251_1772700001)
  //    This supports:
  //      - Cross-channel parents (cli_xxx, feishu.lab_xxx, webchat_xxx)
  //      - Three-level trees: master → dispatch → worker
  if (id.startsWith('webchat_')) {
    const suffix = id.substring('webchat_'.length);
    // Only for API sessions (suffix contains non-digit chars)
    if (/[^0-9]/.test(suffix)) {
      const tsMatch = suffix.match(/_(\d{10})(?:_|$)/);
      if (tsMatch && allSessionIds) {
        const ts = tsMatch[1];
        // Priority a: exact match — session id like {channel}_{timestamp}
        // This matches patterns like webchat_1772696251, cli_1772696251
        // We look for ids where the part after the channel prefix is exactly the timestamp
        for (const candidate of allSessionIds) {
          // Check if candidate ends with _{ts} AND the part before is a simple channel prefix
          // i.e., candidate is like "webchat_1772696251" or "cli_1772696251"
          if (candidate.endsWith('_' + ts)) {
            // Ensure this is a root session (channel_timestamp pattern, no extra underscores in between)
            const prefix = candidate.substring(0, candidate.length - ts.length - 1);
            // For channel.subchannel format (feishu.lab), check the part before dot
            // Root session patterns: webchat_ts, cli_ts, feishu.lab_ts, feishu.lab_ou_xxx_ts
            // We need to distinguish root sessions from other sessions ending with _ts
            // Root: the prefix is a channel name (no digits, or channel.subchannel)
            // A simple heuristic: if prefix doesn't contain any 10-digit number, it's likely a root
            if (!/\d{10}/.test(prefix) && candidate !== id) {
              return candidate;
            }
          }
        }
        // Priority b: suffix match — session ending with _<timestamp>
        // This enables three-level trees (worker → dispatch)
        for (const candidate of allSessionIds) {
          if (candidate !== id && candidate.endsWith('_' + ts)) {
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
 * All lookups use session.id (globally unique), NOT sessionKey.
 * Returns: { roots, nodeByKey }
 *   - roots: sessions that have no parent (or parent not found)
 *   - nodeByKey: id → SessionTreeNode
 */
function buildSessionTree(
  sessions: Session[],
  parentMap: Record<string, string>,
): {
  roots: SessionTreeNode[];
  nodeByKey: Map<string, SessionTreeNode>;
} {
  // Collect all session ids
  const allSessionIds = new Set<string>();
  for (const s of sessions) {
    allSessionIds.add(s.id);
  }

  // Create tree nodes keyed by id
  const nodeByKey = new Map<string, SessionTreeNode>();
  for (const s of sessions) {
    nodeByKey.set(s.id, { session: s, children: [], descendantCount: 0 });
  }

  // Assign children
  const childSessionIds = new Set<string>();
  for (const s of sessions) {
    const parentId = resolveParent(s, parentMap, allSessionIds);
    if (!parentId) continue;

    const parentNode = nodeByKey.get(parentId);
    const childNode = nodeByKey.get(s.id);
    if (parentNode && childNode && parentNode !== childNode) {
      parentNode.children.push(childNode);
      childSessionIds.add(s.id);
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
    if (!childSessionIds.has(s.id)) {
      const node = nodeByKey.get(s.id);
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
    const ch = getChannel(node.session.id);
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
  isRunning: boolean;
  subagentInfo?: SubagentInfo;
  descendantCount: number;
  onClick: () => void;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
  onToggleDone: () => void;
}

function SessionItem({
  id, summary, filename, sessionKey, lastActiveAt,
  isActive, isDone, isRunning, subagentInfo, descendantCount, onClick, onRename, onDelete, onToggleDone,
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
            {isRunning && <span className={styles.runningIndicator} />}
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
      {subagentInfo && (
        <div className={styles.subagentStatus}>
          ⚙️ {subagentInfo.iteration}/{subagentInfo.max_iterations}
          {subagentInfo.last_tool && ` · ${subagentInfo.last_tool}`}
        </div>
      )}
    </div>
  );
}

/** Inline children panel shown below the active parent session */
function ChildrenPanel({
  children,
  depth,
  expandedKeys,
  tagsMap,
  runningKeys,
  subagentMap,
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
  runningKeys: Set<string>;
  subagentMap: Map<string, SubagentInfo[]>;
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
        const ck = child.session.id;
        const childSK = child.session.sessionKey || '';
        const isActive = child.session.id === activeSessionId;
        const isExpanded = expandedKeys[ck] === true;
        const hasChildren = child.children.length > 0;
        const childIsDone = (tagsMap[ck] || []).includes('done');
        const childIsRunning = runningKeys.has(childSK);

        // Find subagent info for this child across all parent entries
        let childSubagentInfo: SubagentInfo | undefined;
        for (const [, subs] of subagentMap) {
          const match = subs.find((s) => s.session_key === childSK && s.status === 'running');
          if (match) { childSubagentInfo = match; break; }
        }

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
                {childIsRunning && <span className={styles.runningIndicatorSmall} />}
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
            {childSubagentInfo && (
              <div className={styles.subagentStatusSmall}>
                ⚙️ {childSubagentInfo.iteration}/{childSubagentInfo.max_iterations}
                {childSubagentInfo.last_tool && ` · ${childSubagentInfo.last_tool}`}
              </div>
            )}
            {hasChildren && isExpanded && (
              <ChildrenPanel
                children={child.children}
                depth={depth + 1}
                expandedKeys={expandedKeys}
                tagsMap={tagsMap}
                runningKeys={runningKeys}
                subagentMap={subagentMap}
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
  runningKeys,
  subagentMap,
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
  runningKeys: Set<string>;
  subagentMap: Map<string, SubagentInfo[]>;
  onToggleExpand: (key: string) => void;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onToggleDone: (session: Session) => void;
}) {
  const sk = node.session.id;
  const sessionKey = node.session.sessionKey || '';
  const isActive = node.session.id === activeSessionId;
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedKeys[sk] === true;
  const isDone = (tagsMap[sk] || []).includes('done');
  const isRunning = runningKeys.has(sessionKey);

  // Find subagent info for this session
  let mySubagentInfo: SubagentInfo | undefined;
  for (const [, subs] of subagentMap) {
    const match = subs.find((s) => s.session_key === sessionKey && s.status === 'running');
    if (match) { mySubagentInfo = match; break; }
  }

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
          isRunning={isRunning}
          subagentInfo={mySubagentInfo}
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
              runningKeys={runningKeys}
              subagentMap={subagentMap}
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

  // §48: Poll running sessions
  const runningKeys = useRunningSessions();

  // Build tree
  const { roots } = useMemo(
    () => buildSessionTree(sessions, parentMap),
    [sessions, parentMap],
  );

  // §49: Collect parent session keys that have children, for subagent polling
  const parentSessionKeys = useMemo(() => {
    const keys: string[] = [];
    for (const node of roots) {
      if (node.children.length > 0 && node.session.sessionKey) {
        keys.push(node.session.sessionKey);
      }
    }
    return keys;
  }, [roots]);

  // §49: Poll subagent status
  const subagentMap = useSubagentStatus(parentSessionKeys, runningKeys);

  // Filter out "done" root sessions when hideDone is on
  const filteredRoots = useMemo(() => {
    if (!hideDone) return roots;
    return roots.filter((node) => {
      const key = node.session.id;
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
                key={node.session.id}
                node={node}
                activeSessionId={activeSessionId}
                expandedKeys={expandedKeys}
                tagsMap={tagsMap}
                runningKeys={runningKeys}
                subagentMap={subagentMap}
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
