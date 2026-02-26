import { useState, useRef, useCallback, useEffect, type KeyboardEvent, type ChangeEvent } from 'react';
import { useMessageStore } from '@/store/messageStore';
import { useSessionStore } from '@/store/sessionStore';
import styles from './ChatInput.module.css';

export default function ChatInput() {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sending, sendingSessionId, sendMessage, cancelTask } = useMessageStore();
  const { activeSessionId } = useSessionStore();

  // Is the current session the one with the running task?
  const isCurrentSessionSending = sending && sendingSessionId === activeSessionId;
  // Is another session running a task? (disable input but don't show stop button)
  const isOtherSessionSending = sending && sendingSessionId !== null && sendingSessionId !== activeSessionId;

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

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    adjustHeight();
  };

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || !activeSessionId || sending) return;
    setText('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    await sendMessage(activeSessionId, trimmed);
  }, [text, activeSessionId, sending, sendMessage]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const disabled = !activeSessionId;
  const inputDisabled = disabled || sending;

  // Determine placeholder text
  let placeholder = '输入消息... (Enter 发送, Shift+Enter 换行)';
  if (disabled) {
    placeholder = '请先选择或创建对话';
  } else if (isOtherSessionSending) {
    placeholder = '其他对话正在执行任务，请等待完成...';
  } else if (isCurrentSessionSending) {
    placeholder = '任务执行中...';
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
          disabled={inputDisabled}
        />
        {isCurrentSessionSending ? (
          <button
            className={`${styles.sendButton} ${styles.stopButton}`}
            onClick={cancelTask}
          >
            ■ 停止
          </button>
        ) : (
          <button
            className={styles.sendButton}
            onClick={handleSend}
            disabled={inputDisabled || !text.trim()}
          >
            发送
          </button>
        )}
      </div>
    </div>
  );
}
