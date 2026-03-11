// Message state store — v21 (slash commands support)
import { create } from 'zustand';
import type { Message, SessionTask } from '../types';
import * as api from '../services/api';
import { useSessionStore } from './sessionStore';

// Build version marker for cache busting
const _BUILD_VERSION = '21.0';
console.debug('[messageStore] version:', _BUILD_VERSION);

const EMPTY_TASK: SessionTask = {
  sending: false,
  progressSteps: [],
  recovering: false,
  abortController: null,
};

// ── Slash command definitions ──

const HELP_TEXT = `🐈 nanobot commands:
/new      — 开始新对话（创建新 session）
/flush    — 归档当前记忆并清空对话
/stop     — 停止正在执行的任务
/provider — 查看/切换 LLM provider
/session  — 查看当前 session 信息
/help     — 显示此帮助信息`;

/** Create a local system message (not persisted to JSONL) */
function _makeSystemMsg(content: string): Message {
  return {
    id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    role: 'system-local',
    content,
    timestamp: new Date().toISOString(),
  };
}

/** Format token count to human-readable string */
function _formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface MessageStore {
  messages: Message[];
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  taskBySession: Record<string, SessionTask>;  // per-session task state
  draftBySession: Record<string, string>;       // per-session input draft text
  loadMessages: (sessionId: string) => Promise<void>;
  loadMoreMessages: (sessionId: string) => Promise<void>;
  sendMessage: (sessionId: string, content: string, images?: string[]) => Promise<void>;
  injectMessage: (sessionId: string, content: string) => Promise<void>;
  cancelTask: (sessionId: string) => Promise<void>;
  checkRunningTask: (sessionId: string) => Promise<void>;
  clearMessages: () => void;
  setDraft: (sessionId: string, text: string) => void;
  getDraft: (sessionId: string) => string;
  getTask: (sessionId: string) => SessionTask;
}

const PAGE_SIZE = 30;
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 100;  // 5 minutes max

/** Helper to update a session's task state immutably */
function _updateTask(
  state: { taskBySession: Record<string, SessionTask> },
  sessionId: string,
  updates: Partial<SessionTask>,
): { taskBySession: Record<string, SessionTask> } {
  const current = state.taskBySession[sessionId] || { ...EMPTY_TASK };
  return {
    taskBySession: {
      ...state.taskBySession,
      [sessionId]: { ...current, ...updates },
    },
  };
}

export const useMessageStore = create<MessageStore>((set, get) => ({
  messages: [],
  hasMore: false,
  loading: false,
  error: null,
  taskBySession: {},
  draftBySession: {},

  getTask: (sessionId) => {
    return get().taskBySession[sessionId] || EMPTY_TASK;
  },

  loadMessages: async (sessionId) => {
    set({ loading: true, error: null, messages: [], hasMore: false });
    try {
      const data = await api.fetchMessages(sessionId, PAGE_SIZE);
      set({
        messages: data.messages || [],
        hasMore: data.hasMore ?? false,
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  loadMoreMessages: async (sessionId) => {
    const { messages, hasMore, loading } = get();
    if (!hasMore || loading) return;
    set({ loading: true });
    try {
      const earliest = messages[0]?.timestamp;
      const data = await api.fetchMessages(sessionId, PAGE_SIZE, earliest);
      set((s) => ({
        messages: [...(data.messages || []), ...s.messages],
        hasMore: data.hasMore ?? false,
        loading: false,
      }));
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  sendMessage: async (sessionId, content, images) => {
    const task = get().getTask(sessionId);

    // ── Slash command interception (checked BEFORE task.sending guard) ──
    const trimmed = content.trim();
    const cmd = trimmed.toLowerCase().split(/\s/)[0];

    if (cmd.startsWith('/')) {
      switch (cmd) {
        case '/help': {
          // Local command: show help as system message
          set((s) => ({
            messages: [...s.messages, _makeSystemMsg(HELP_TEXT)],
            error: null,
          }));
          return;
        }

        case '/stop': {
          // Local command: stop running task
          if (task.sending) {
            await get().cancelTask(sessionId);
          } else {
            set((s) => ({
              messages: [...s.messages, _makeSystemMsg('没有正在执行的任务。')],
            }));
          }
          return;
        }

        case '/new': {
          // Frontend-only: create a new session and switch to it
          if (task.sending) {
            set((s) => ({
              messages: [...s.messages, _makeSystemMsg('任务执行中，请先 /stop 停止任务再执行 /new。')],
            }));
            return;
          }

          try {
            const newSession = await useSessionStore.getState().createSession();
            if (newSession) {
              set(() => ({
                messages: [],
                hasMore: false,
                error: null,
              }));
              set((s) => ({
                messages: [...s.messages, _makeSystemMsg('✅ 已创建新对话。')],
              }));
            } else {
              set((s) => ({
                messages: [...s.messages, _makeSystemMsg('❌ 创建新对话失败。')],
              }));
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            set((s) => ({
              messages: [...s.messages, _makeSystemMsg(`❌ 创建新对话失败: ${errorMsg}`)],
            }));
          }
          return;
        }

        case '/flush': {
          // Backend command: archive memory and clear current session
          if (task.sending) {
            set((s) => ({
              messages: [...s.messages, _makeSystemMsg('任务执行中，请先 /stop 停止任务再执行 /flush。')],
            }));
            return;
          }

          const cmdMsg: Message = {
            id: `temp_${Date.now()}`,
            role: 'user',
            content: '/flush',
            timestamp: new Date().toISOString(),
          };
          set((s) => ({
            messages: [...s.messages, cmdMsg],
            error: null,
            ..._updateTask(s, sessionId, {
              sending: true,
              progressSteps: [],
              recovering: false,
              abortController: null,
            }),
          }));

          try {
            await new Promise<void>((resolve, reject) => {
              const controller = api.sendMessageStream(sessionId, '/flush', {
                onProgress: (step) => {
                  set((s) => {
                    const cur = s.taskBySession[sessionId] || { ...EMPTY_TASK };
                    return _updateTask(s, sessionId, {
                      progressSteps: [...cur.progressSteps, step],
                    });
                  });
                },
                onDone: () => resolve(),
                onError: (msg) => reject(new Error(msg)),
              });
              set((s) => _updateTask(s, sessionId, { abortController: controller }));
            });

            // /flush completed — reload messages (should be empty) + refresh session list
            await _reloadMessages(sessionId, set);
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            set((s) => ({
              ..._updateTask(s, sessionId, {
                sending: false,
                progressSteps: [],
                abortController: null,
              }),
              error: `⚠️ ${errorMsg}`,
            }));
          }
          return;
        }

        default: {
          // Check for /session command
          if (cmd === '/session') {
            if (task.sending) {
              set((s) => ({
                messages: [...s.messages, _makeSystemMsg('⚠️ 任务执行中，请稍后查看 session 信息。')],
              }));
              return;
            }

            try {
              // Convert session ID to session key format for API
              const key = (() => {
                const idx = sessionId.indexOf('_');
                if (idx > 0) return sessionId.substring(0, idx) + ':' + sessionId.substring(idx + 1);
                return sessionId;
              })();

              // Fetch usage data
              let usageLine = 'N/A';
              try {
                const usage = await api.fetchSessionUsage(key);
                usageLine = (
                  `${usage.prompt_tokens.toLocaleString()} prompt + ` +
                  `${usage.completion_tokens.toLocaleString()} completion = ` +
                  `**${usage.total_tokens.toLocaleString()}** total ` +
                  `(${usage.llm_calls} 次调用)`
                );
                // Append cache info if available
                const cacheRead = usage.cache_read_input_tokens ?? 0;
                const cacheCreation = usage.cache_creation_input_tokens ?? 0;
                if (cacheRead || cacheCreation) {
                  const cacheParts: string[] = [];
                  if (cacheRead) cacheParts.push(`缓存命中: ${_formatTokens(cacheRead)}`);
                  if (cacheCreation) cacheParts.push(`缓存写入: ${_formatTokens(cacheCreation)}`);
                  const uncached = usage.prompt_tokens - cacheRead - cacheCreation;
                  if (uncached > 0) cacheParts.push(`未缓存: ${_formatTokens(uncached)}`);
                  usageLine += `\n**缓存**: ${cacheParts.join(' · ')}`;
                }
              } catch {
                usageLine = '查询失败';
              }

              // Fetch provider info
              let providerLine = 'N/A';
              try {
                const { useProviderStore } = await import('@/store/providerStore');
                await useProviderStore.getState().fetchProvider();
                const { active } = useProviderStore.getState();
                if (active) {
                  providerLine = `${active.name} / \`${active.model}\``;
                }
              } catch {
                providerLine = '查询失败';
              }

              const statusText = task.sending ? '🔄 执行中（正在处理任务）' : '💤 空闲（等待输入）';

              const lines = [
                `📋 **Session 信息**`,
                ``,
                `**Session Key**: \`${key}\``,
                `**状态**: ${statusText}`,
                `**Provider**: ${providerLine}`,
                `**Token 用量**: ${usageLine}`,
              ];

              set((s) => ({
                messages: [...s.messages, _makeSystemMsg(lines.join('\n'))],
              }));
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              set((s) => ({
                messages: [...s.messages, _makeSystemMsg(`❌ ${msg}`)],
              }));
            }
            return;
          }

          // Check for /provider (may have arguments, so can't use exact match)
          if (cmd === '/provider' || cmd.startsWith('/provider')) {
            // /provider command: query or switch provider
            if (task.sending) {
              set((s) => ({
                messages: [...s.messages, _makeSystemMsg('⚠️ 任务执行中，无法切换 provider。')],
              }));
              return;
            }

            const parts = trimmed.split(/\s+/);
            if (parts.length === 1) {
              // /provider — show status
              try {
                const { useProviderStore } = await import('@/store/providerStore');
                await useProviderStore.getState().fetchProvider();
                const { active, available } = useProviderStore.getState();
                if (!active) {
                  set((s) => ({
                    messages: [...s.messages, _makeSystemMsg('❌ 无法获取 provider 信息。')],
                  }));
                  return;
                }
                const lines = [`🔌 当前: **${active.name}** / \`${active.model}\``, '', '可用 providers:'];
                for (const item of available) {
                  const marker = item.name === active.name ? ' ← 当前' : '';
                  lines.push(`  • **${item.name}** (\`${item.model}\`)${marker}`);
                }
                set((s) => ({
                  messages: [...s.messages, _makeSystemMsg(lines.join('\n'))],
                }));
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                set((s) => ({
                  messages: [...s.messages, _makeSystemMsg(`❌ ${msg}`)],
                }));
              }
            } else {
              // /provider <name> [model] — switch
              const providerName = parts[1];
              const model = parts[2] || undefined;
              try {
                const { useProviderStore } = await import('@/store/providerStore');
                await useProviderStore.getState().switchProvider(providerName, model);
                const { active } = useProviderStore.getState();
                set((s) => ({
                  messages: [...s.messages, _makeSystemMsg(
                    `✅ 已切换到 **${active?.name}** / \`${active?.model}\``
                  )],
                }));
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                set((s) => ({
                  messages: [...s.messages, _makeSystemMsg(`❌ ${msg}`)],
                }));
              }
            }
            return;
          }

          // Unknown slash command — restore input for easy editing
          set((s) => ({
            messages: [...s.messages, _makeSystemMsg(
              `未知命令: ${cmd}\n\n输入 /help 查看可用命令。`
            )],
          }));
          // Restore original input to draft so user can edit and resend
          get().setDraft(sessionId, content);
          return;
        }
      }
    }

    // ── Normal message sending (non-slash) ──

    // Prevent sending if THIS session already has a running task
    if (task.sending) return;

    // Optimistic update: add user message
    const userMsg: Message = {
      id: `temp_${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    // Signal that user initiated this send (for scroll behavior)
    window.dispatchEvent(new CustomEvent('user-message-sent'));
    set((s) => ({
      messages: [...s.messages, userMsg],
      error: null,
      ..._updateTask(s, sessionId, {
        sending: true,
        progressSteps: [],
        recovering: false,
        abortController: null,
      }),
    }));

    try {
      await new Promise<void>((resolve, reject) => {
        const controller = api.sendMessageStream(sessionId, content, {
          onProgress: (step) => {
            set((s) => {
              const cur = s.taskBySession[sessionId] || { ...EMPTY_TASK };
              return _updateTask(s, sessionId, {
                progressSteps: [...cur.progressSteps, step],
              });
            });
          },
          onDone: () => resolve(),
          onError: (msg) => reject(new Error(msg)),
        }, images);
        set((s) => _updateTask(s, sessionId, { abortController: controller }));
      });

      // Task completed normally via SSE — reload messages from JSONL
      await _reloadMessages(sessionId, set);
      // Trigger usage indicator refresh
      window.dispatchEvent(new CustomEvent('usage-updated'));
    } catch (err) {
      // Check if this was a user-initiated cancel
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled — just reset state, don't show error
        set((s) => _updateTask(s, sessionId, {
          sending: false,
          progressSteps: [],
          recovering: false,
          abortController: null,
        }));
        return;
      }

      // SSE stream broke — try graceful recovery via polling
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`SSE error for ${sessionId}: ${errorMsg}, attempting recovery...`);

      // Check if this looks like a connection/transport error (not a business error)
      const isConnectionError = /fetch|network|abort|reset|refused|timeout|timed|connection|running/i.test(errorMsg);

      // Distinguish between two types of connection errors:
      // 1. SSE mid-stream disconnect: message WAS delivered, task may still be running → poll recovery
      //    Error: "SSE connection reset — task may still be running"
      // 2. Fetch failure: message NEVER reached backend → rollback optimistic update, prompt retry
      //    Error: "Failed to fetch" / "网络错误" / "NetworkError" etc.
      const isSseDisconnect = /SSE connection reset|task may still be running/i.test(errorMsg);
      const isFetchFailure = isConnectionError && !isSseDisconnect;

      if (isFetchFailure) {
        // Fetch itself failed — message never reached the backend.
        // Rollback the optimistic user message and reset state.
        console.warn(`Fetch failed for ${sessionId}: message not delivered, rolling back.`);
        set((s) => ({
          messages: s.messages.filter((m) => m.id !== userMsg.id),
          ..._updateTask(s, sessionId, {
            sending: false,
            progressSteps: [],
            recovering: false,
            abortController: null,
          }),
          error: '⚠️ 消息发送失败（服务暂不可用），请稍后重试',
        }));
      } else if (isConnectionError) {
        // SSE mid-stream disconnect — message was delivered, task may still be running.
        // Enter poll recovery to wait for task completion.
        set((s) => _updateTask(s, sessionId, { recovering: true, abortController: null }));
        set({ error: null });
        const recovered = await _pollTaskStatus(sessionId, set);
        if (recovered) {
          await _reloadMessages(sessionId, set);
        } else {
          set((s) => ({
            ..._updateTask(s, sessionId, {
              sending: false,
              recovering: false,
              progressSteps: [],
              abortController: null,
            }),
            error: `⚠️ ${errorMsg}（任务可能仍在后台执行，请稍后刷新页面查看结果）`,
          }));
        }
      } else {
        // Business error (e.g. nanobot returned error)
        set((s) => ({
          ..._updateTask(s, sessionId, {
            sending: false,
            progressSteps: [],
            abortController: null,
          }),
          error: `⚠️ ${errorMsg}`,
        }));
      }
    }
  },

  injectMessage: async (sessionId, content) => {
    const task = get().getTask(sessionId);
    if (!task.sending) {
      console.warn('Cannot inject: no running task for session', sessionId);
      return;
    }

    try {
      const result = await api.injectMessage(sessionId, content);
      if (result.status === 'injected') {
        // Show optimistic inject message in progress
        set((s) => {
          const cur = s.taskBySession[sessionId] || { ...EMPTY_TASK };
          return _updateTask(s, sessionId, {
            progressSteps: [...cur.progressSteps, { text: `📝 User: ${content.slice(0, 80)}`, type: 'user_inject' }],
          });
        });
      } else {
        console.warn('Inject failed:', result.message);
      }
    } catch (err) {
      console.warn('Inject error:', err);
    }
  },

  cancelTask: async (sessionId) => {
    const task = get().getTask(sessionId);

    // Abort the SSE fetch connection
    if (task.abortController) {
      task.abortController.abort();
    }

    // Kill the backend task
    try {
      await api.killTask(sessionId);
    } catch (err) {
      console.warn('Failed to kill backend task:', err);
    }

    set((s) => _updateTask(s, sessionId, {
      sending: false,
      progressSteps: [],
      recovering: false,
      abortController: null,
    }));
    set({ error: null });

    // Reload messages to show whatever was saved before kill
    const activeSessionId = useSessionStore.getState().activeSessionId;
    if (activeSessionId === sessionId) {
      try {
        const data = await api.fetchMessages(sessionId, PAGE_SIZE);
        set({
          messages: data.messages || [],
          hasMore: data.hasMore ?? false,
        });
      } catch {
        // Ignore reload errors after cancel
      }
    }
  },

  checkRunningTask: async (sessionId) => {
    const task = get().getTask(sessionId);

    // If already sending for THIS session (e.g. SSE still connected), just restore progress
    if (task.sending) {
      try {
        const status = await api.fetchTaskStatus(sessionId);
        if (status.status === 'running' && status.progress && status.progress.length > 0) {
          set((s) => _updateTask(s, sessionId, {
            progressSteps: status.progress!.map((text: string) => ({ text })),
          }));
        }
      } catch {
        // Ignore — the existing SSE/attach will handle it
      }
      return;
    }

    try {
      const status = await api.fetchTaskStatus(sessionId);
      if (status.status !== 'running') return;

      // There's a running task for this session — recover state
      // Restore full progress history from backend
      const restoredSteps = (status.progress || []).map((text: string) => ({ text }));
      set((s) => ({
        ..._updateTask(s, sessionId, {
          sending: true,
          progressSteps: restoredSteps,
          recovering: false,
        }),
        error: null,
      }));

      // Attach to the running task via polling
      // Uses onProgressSync to REPLACE progressSteps each poll (not append)
      await new Promise<void>((resolve, reject) => {
        const controller = api.attachTask(sessionId, {
          onProgressSync: (steps) => {
            set((s) => _updateTask(s, sessionId, {
              progressSteps: steps.map((text: string) => ({ text })),
            }));
          },
          onDone: () => resolve(),
          onError: (msg) => reject(new Error(msg)),
        });
        set((s) => _updateTask(s, sessionId, { abortController: controller }));
      });

      // Task completed — reload messages
      await _reloadMessages(sessionId, set);
      // Trigger usage indicator refresh
      window.dispatchEvent(new CustomEvent('usage-updated'));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isConnectionError = /fetch|network|abort|reset|refused|timeout|timed|connection|running/i.test(errorMsg);
      const currentTask = get().getTask(sessionId);

      if (isConnectionError && currentTask.sending) {
        // Connection broke during attach — poll for recovery
        set((s) => _updateTask(s, sessionId, { recovering: true, abortController: null }));
        const recovered = await _pollTaskStatus(sessionId, set);
        if (recovered) {
          await _reloadMessages(sessionId, set);
        } else {
          set((s) => _updateTask(s, sessionId, {
            sending: false,
            recovering: false,
            progressSteps: [],
            abortController: null,
          }));
        }
      } else if (currentTask.sending) {
        // Non-connection error — task might have ended
        set((s) => _updateTask(s, sessionId, {
          sending: false,
          progressSteps: [],
          recovering: false,
          abortController: null,
        }));
      }
    }
  },

  clearMessages: () => {
    set({ messages: [], hasMore: false, error: null });
    // NOTE: do NOT clear taskBySession here — tasks may still be running
  },

  setDraft: (sessionId, text) => {
    set((s) => ({
      draftBySession: { ...s.draftBySession, [sessionId]: text },
    }));
  },

  getDraft: (sessionId) => {
    return get().draftBySession[sessionId] || '';
  },
}));


/**
 * Poll task status until done/error or timeout.
 * Returns true if task completed successfully.
 */
async function _pollTaskStatus(
  sessionId: string,
  set: (fn: (s: MessageStore) => Partial<MessageStore>) => void,
): Promise<boolean> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    try {
      const status = await api.fetchTaskStatus(sessionId);

      if (status.status === 'done') {
        console.log(`Task recovered for ${sessionId}: done`);
        return true;
      }
      if (status.status === 'error') {
        set((s) => ({
          ..._updateTask(s, sessionId, {
            sending: false,
            recovering: false,
            abortController: null,
          }),
          error: `⚠️ 后台任务失败: ${status.error || '未知错误'}`,
        }));
        return false;
      }
      if (status.status === 'unknown') {
        // Worker doesn't know about this task — might have restarted too
        if (i > 5) {
          set((s) => ({
            ..._updateTask(s, sessionId, {
              sending: false,
              recovering: false,
              abortController: null,
            }),
            error: '⚠️ 无法恢复任务状态，请刷新页面查看结果',
          }));
          return false;
        }
      }
      // status === 'running' — keep polling, sync progress
      if (status.progress && status.progress.length > 0) {
        set((s) => _updateTask(s, sessionId, {
          progressSteps: status.progress!.map((text: string) => ({ text })),
        }));
      } else if (status.progress_count) {
        set((s) => _updateTask(s, sessionId, {
          progressSteps: [{ text: `⏳ 任务后台执行中... (${status.progress_count} 步)` }],
        }));
      }
    } catch {
      // Gateway still down — keep trying
      console.warn(`Poll attempt ${i + 1} failed for ${sessionId}, retrying...`);
    }
  }

  // Timeout
  set((s) => ({
    ..._updateTask(s, sessionId, {
      sending: false,
      recovering: false,
      abortController: null,
    }),
    error: '⚠️ 轮询超时，请刷新页面查看结果',
  }));
  return false;
}

/**
 * Reload messages from JSONL and reset task state for the session.
 */
async function _reloadMessages(
  sessionId: string,
  set: (fn: (s: MessageStore) => Partial<MessageStore>) => void,
) {
  try {
    // Only update the message list if this session is currently active
    const activeSessionId = useSessionStore.getState().activeSessionId;
    const data = await api.fetchMessages(sessionId, PAGE_SIZE);

    if (activeSessionId === sessionId) {
      set((s) => ({
        messages: data.messages || [],
        hasMore: data.hasMore ?? false,
        ..._updateTask(s, sessionId, {
          sending: false,
          progressSteps: [],
          recovering: false,
          abortController: null,
        }),
      }));
    } else {
      // Session is not active — just clear the task state
      set((s) => _updateTask(s, sessionId, {
        sending: false,
        progressSteps: [],
        recovering: false,
        abortController: null,
      }));
    }
    // Refresh session list
    useSessionStore.getState().fetchSessions();
  } catch {
    set((s) => ({
      ..._updateTask(s, sessionId, {
        sending: false,
        recovering: false,
        abortController: null,
      }),
      error: '⚠️ 消息重载失败，请刷新页面',
    }));
  }
}
