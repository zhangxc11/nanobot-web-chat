import { useRef, useCallback, useEffect, useState, type KeyboardEvent, type ChangeEvent, type DragEvent, type ClipboardEvent } from 'react';
import { useMessageStore } from '@/store/messageStore';
import { useSessionStore } from '@/store/sessionStore';
import { useProviderStore } from '@/store/providerStore';
import { uploadImage } from '@/services/api';
import styles from './ChatInput.module.css';

interface PendingImage {
  id: string;
  file: File;
  previewUrl: string;  // local blob URL for preview
  serverPath?: string;  // server file path after upload
  uploading: boolean;
  error?: string;
}

export default function ChatInput() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { sendMessage, injectMessage, cancelTask, draftBySession, setDraft, getTask } = useMessageStore();
  const { activeSessionId } = useSessionStore();
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  // Provider state
  const { active: activeProvider, available: availableProviders, fetchProvider, switchProvider } = useProviderStore();
  const [providerOpen, setProviderOpen] = useState(false);

  // Fetch provider info on mount
  useEffect(() => {
    fetchProvider();
  }, [fetchProvider]);

  // Get task state for current session
  const task = activeSessionId ? getTask(activeSessionId) : null;
  const isCurrentSessionSending = task?.sending ?? false;

  // Get draft text for current session
  const text = activeSessionId ? (draftBySession[activeSessionId] || '') : '';

  // Clear pending images when switching sessions
  useEffect(() => {
    setPendingImages([]);
  }, [activeSessionId]);

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
    requestAnimationFrame(() => adjustHeight());
  }, [activeSessionId, adjustHeight]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    if (activeSessionId) {
      setDraft(activeSessionId, e.target.value);
    }
    adjustHeight();
  };

  // ── Image handling ──

  const addImages = useCallback(async (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    const newImages: PendingImage[] = imageFiles.map(file => ({
      id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      uploading: true,
    }));

    setPendingImages(prev => [...prev, ...newImages]);

    // Upload each image
    for (const img of newImages) {
      try {
        const result = await uploadImage(img.file);
        setPendingImages(prev =>
          prev.map(p => p.id === img.id ? { ...p, serverPath: result.path, uploading: false } : p)
        );
      } catch (err) {
        setPendingImages(prev =>
          prev.map(p => p.id === img.id ? { ...p, uploading: false, error: String(err) } : p)
        );
      }
    }
  }, []);

  const removeImage = useCallback((id: string) => {
    setPendingImages(prev => {
      const img = prev.find(p => p.id === id);
      if (img) URL.revokeObjectURL(img.previewUrl);
      return prev.filter(p => p.id !== id);
    });
  }, []);

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) addImages(files);
    // Reset input so same file can be selected again
    if (e.target) e.target.value = '';
  }, [addImages]);

  // Drag & drop handlers
  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    addImages(files);
  }, [addImages]);

  // Paste handler (for clipboard images)
  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      addImages(imageFiles);
    }
  }, [addImages]);

  // ── Send ──

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    const hasImages = pendingImages.some(img => img.serverPath && !img.error);
    if ((!trimmed && !hasImages) || !activeSessionId) return;

    // ── Slash command interception (works in both normal and inject mode) ──
    const cmd = trimmed.toLowerCase().split(/\s/)[0];
    if (cmd.startsWith('/')) {
      // Clear draft
      setDraft(activeSessionId, '');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }

      if (cmd === '/stop') {
        // /stop always triggers cancel, regardless of mode
        if (isCurrentSessionSending) {
          await cancelTask(activeSessionId);
        } else {
          // Delegate to sendMessage which will show "no running task" system message
          await sendMessage(activeSessionId, trimmed);
        }
        return;
      }

      // Other slash commands: delegate to sendMessage (which handles /help, /new, etc.)
      await sendMessage(activeSessionId, trimmed);
      return;
    }

    // ── Normal flow (non-slash) ──

    // Collect uploaded image paths
    const imagePaths = pendingImages
      .filter(img => img.serverPath && !img.error)
      .map(img => img.serverPath!);

    // Clear draft and images
    setDraft(activeSessionId, '');
    setPendingImages(prev => {
      prev.forEach(img => URL.revokeObjectURL(img.previewUrl));
      return [];
    });
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    if (isCurrentSessionSending) {
      // Inject mode: send as supplementary input to running task (no images in inject)
      await injectMessage(activeSessionId, trimmed);
    } else {
      // Normal send mode
      await sendMessage(activeSessionId, trimmed || '请看这张图片', imagePaths.length > 0 ? imagePaths : undefined);
    }
  }, [text, pendingImages, activeSessionId, isCurrentSessionSending, sendMessage, injectMessage, cancelTask, setDraft]);

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

  // Close provider dropdown when clicking outside
  useEffect(() => {
    if (!providerOpen) return;
    const handleClick = () => setProviderOpen(false);
    // Delay to avoid closing on the same click that opened it
    const timer = setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
    };
  }, [providerOpen]);

  // Handle provider selection
  const handleProviderSelect = useCallback(async (providerName: string, model: string) => {
    try {
      await switchProvider(providerName, model);
      setProviderOpen(false);
    } catch {
      // Error is handled by the store
    }
  }, [switchProvider]);

  const disabled = !activeSessionId;
  const anyUploading = pendingImages.some(img => img.uploading);

  // Determine placeholder text
  let placeholder = '输入消息或 /help 查看命令 (Shift+Enter 发送)';
  if (disabled) {
    placeholder = '请先选择或创建对话';
  } else if (isCurrentSessionSending) {
    placeholder = '输入补充信息或 /stop 停止 (Shift+Enter 注入)';
  }

  return (
    <div
      className={`${styles.inputArea} ${isDragOver ? styles.dragOver : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Provider selector */}
      {activeProvider && (
        <div className={styles.providerBar}>
          <button
            className={`${styles.providerButton} ${isCurrentSessionSending ? styles.providerDisabled : ''}`}
            onClick={() => !isCurrentSessionSending && setProviderOpen(!providerOpen)}
            disabled={isCurrentSessionSending}
            title={isCurrentSessionSending ? '任务执行中，无法切换' : '切换 LLM Provider'}
          >
            <span className={styles.providerIcon}>🔌</span>
            <span className={styles.providerName}>{activeProvider.name}</span>
            <span className={styles.providerModel}>{activeProvider.model}</span>
            {!isCurrentSessionSending && <span className={styles.providerArrow}>{providerOpen ? '▴' : '▾'}</span>}
          </button>

          {providerOpen && !isCurrentSessionSending && (
            <div className={styles.providerDropdown}>
              {availableProviders.map((p) => (
                <button
                  key={p.name}
                  className={`${styles.providerOption} ${p.name === activeProvider.name ? styles.providerOptionActive : ''}`}
                  onClick={() => handleProviderSelect(p.name, p.model)}
                >
                  <span className={styles.providerOptionName}>{p.name}</span>
                  <span className={styles.providerOptionModel}>{p.model}</span>
                  {p.name === activeProvider.name && <span className={styles.providerOptionCheck}>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Image preview area */}
      {pendingImages.length > 0 && (
        <div className={styles.imagePreviewArea}>
          {pendingImages.map(img => (
            <div key={img.id} className={`${styles.imagePreview} ${img.error ? styles.imageError : ''}`}>
              <img src={img.previewUrl} alt="" className={styles.previewThumb} />
              {img.uploading && <div className={styles.uploadingOverlay}>⏳</div>}
              {img.error && <div className={styles.uploadingOverlay}>❌</div>}
              <button
                className={styles.removeImageBtn}
                onClick={() => removeImage(img.id)}
                title="移除图片"
              >×</button>
            </div>
          ))}
        </div>
      )}

      <div className={styles.inputWrapper}>
        {/* Image attach button */}
        {!isCurrentSessionSending && (
          <button
            className={styles.attachButton}
            onClick={handleFileSelect}
            disabled={disabled}
            title="添加图片 (也可拖拽或粘贴)"
          >
            📎
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileInputChange}
        />

        <textarea
          ref={textareaRef}
          className={styles.input}
          placeholder={placeholder}
          rows={1}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
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
            disabled={disabled || (!text.trim() && !pendingImages.some(img => img.serverPath)) || anyUploading}
          >
            发送
          </button>
        )}
      </div>
    </div>
  );
}
