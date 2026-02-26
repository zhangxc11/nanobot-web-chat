import { useRef, useCallback, useEffect, type KeyboardEvent, type ChangeEvent } from 'react';
import { useMessageStore } from '@/store/messageStore';
import { useSessionStore } from '@/store/sessionStore';
import styles from './ChatInput.module.css';

export default function ChatInput() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendMessage, injectMessage, cancelTask, draftBySession, setDraft, getTask } = useMessageStore();
  const { activeSessionId } = useSessionStore();

  // Get task state for current session
  const task = activeSessionId ? getTask(activeSessionId) : null;
  const isCurrentSessionSending = task?.sending ?? false;

  // Get draft text for current session
  const text = activeSessionId ? (draftBySession[activeSessionId] || '') : '';

  // Auto-focus when active session changes
  useEffect(() => {
    if (activeSessionId) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [activeSessionId]);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';
  }, []);

  // Adjust textarea height when switching sessions (draft text may differ in length)
  useEffect(() => {
    // Use requestAnimationFrame to ensure the textarea value is updated first
    requestAnimationFrame(() => adjustHeight());
  }, [activeSessionId, adjustHeight]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    if (activeSessionId) {
      setDraft(activeSessionId, e.target.value);
    }
    adjustHeight();
  };

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || !activeSessionId) return;

    // Clear draft for this session
    setDraft(activeSessionId, '');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    if (isCurrentSessionSending) {
      // Inject mode: send as supplementary input to running task
      await injectMessage(activeSessionId, trimmed);
    } else {
      // Normal send mode
      await sendMessage(activeSessionId, trimmed);
    }
  }, [text, activeSessionId, isCurrentSessionSending, sendMessage, injectMessage, setDraft]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCancel = useCallback(() => {
    if (activeSessionId) {
      cancelTask(activeSessionId);
    }
  }, [activeSessionId, cancelTask]);

  const disabled = !activeSessionId;

  // Determine placeholder text
  let placeholder = '输入消息... (Shift+Enter 发送, Enter 换行)';
  if (disabled) {
    placeholder = '请先选择或创建对话';
  } else if (isCurrentSessionSending) {
    placeholder = '输入补充信息... (Shift+Enter 注入)';
  }

  return (
    <div className={styles.inputArea}>
      <div className={styles.inputWrapper}>
        <textarea
          ref={textareaRef}
          className={styles.input}
          placeholder={placeholder}
          rows={1}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        {isCurrentSessionSending ? (
          <div className={styles.actionButtons}>
            <button
              className={`${styles.sendButton} ${styles.injectButton}`}
              onClick={handleSend}
              disabled={!text.trim()}
              title="注入补充信息到执行中的任务"
            >
              📝 注入
            </button>
            <button
              className={`${styles.sendButton} ${styles.stopButton}`}
              onClick={handleCancel}
            >
              ■ 停止
            </button>
          </div>
        ) : (
          <button
            className={styles.sendButton}
            onClick={handleSend}
            disabled={disabled || !text.trim()}
          >
            发送
          </button>
        )}
      </div>
    </div>
  );
}
