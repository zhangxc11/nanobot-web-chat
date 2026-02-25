import { useState, useRef, useCallback, KeyboardEvent, ChangeEvent } from 'react';
import { useMessageStore } from '@/store/messageStore';
import { useSessionStore } from '@/store/sessionStore';
import styles from './ChatInput.module.css';

export default function ChatInput() {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sending, sendMessage } = useMessageStore();
  const { activeSessionId } = useSessionStore();

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

  return (
    <div className={styles.inputArea}>
      <div className={styles.inputWrapper}>
        <textarea
          ref={textareaRef}
          className={styles.input}
          placeholder={disabled ? '请先选择或创建对话' : '输入消息... (Enter 发送, Shift+Enter 换行)'}
          rows={1}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled || sending}
        />
        <button
          className={styles.sendButton}
          onClick={handleSend}
          disabled={disabled || sending || !text.trim()}
        >
          {sending ? '发送中...' : '发送'}
        </button>
      </div>
    </div>
  );
}
