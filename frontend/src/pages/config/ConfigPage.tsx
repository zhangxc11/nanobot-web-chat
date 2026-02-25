import { useState, useEffect, useCallback } from 'react';
import styles from './ConfigPage.module.css';

interface ConfigSection {
  key: string;
  label: string;
  icon: string;
}

const SECTIONS: ConfigSection[] = [
  { key: 'agents', label: 'Agent 设置', icon: '🤖' },
  { key: 'providers', label: 'AI 服务商', icon: '🔑' },
  { key: 'channels', label: '消息渠道', icon: '📡' },
  { key: 'gateway', label: '网关设置', icon: '🌐' },
  { key: 'tools', label: '工具设置', icon: '🔧' },
];

// Fields that should be masked as passwords
const SENSITIVE_KEYS = new Set(['apiKey', 'token', 'secret', 'appSecret', 'clawToken', 'encryptKey', 'verificationToken', 'bridgeToken', 'clientSecret', 'imapPassword', 'smtpPassword', 'appToken', 'botToken']);

function isSensitive(key: string): boolean {
  return SENSITIVE_KEYS.has(key);
}

function ConfigValue({ 
  keyPath, 
  value, 
  onChange 
}: { 
  keyPath: string; 
  value: unknown; 
  onChange: (keyPath: string, val: unknown) => void;
}) {
  const lastKey = keyPath.split('.').pop() || '';
  const [showPassword, setShowPassword] = useState(false);

  if (value === null || value === undefined) {
    return (
      <input
        className={styles.input}
        type="text"
        value=""
        placeholder="null"
        onChange={(e) => onChange(keyPath, e.target.value || null)}
      />
    );
  }

  if (typeof value === 'boolean') {
    return (
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(keyPath, e.target.checked)}
        />
        <span className={styles.toggleSlider} />
        <span className={styles.toggleLabel}>{value ? 'true' : 'false'}</span>
      </label>
    );
  }

  if (typeof value === 'number') {
    return (
      <input
        className={styles.input}
        type="number"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          onChange(keyPath, v.includes('.') ? parseFloat(v) : parseInt(v, 10));
        }}
      />
    );
  }

  if (typeof value === 'string') {
    if (isSensitive(lastKey)) {
      return (
        <div className={styles.passwordField}>
          <input
            className={styles.input}
            type={showPassword ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(keyPath, e.target.value)}
          />
          <button
            className={styles.eyeButton}
            onClick={() => setShowPassword(!showPassword)}
            title={showPassword ? '隐藏' : '显示'}
          >
            {showPassword ? '🙈' : '👁'}
          </button>
        </div>
      );
    }
    return (
      <input
        className={styles.input}
        type="text"
        value={value}
        onChange={(e) => onChange(keyPath, e.target.value)}
      />
    );
  }

  if (Array.isArray(value)) {
    return (
      <input
        className={styles.input}
        type="text"
        value={JSON.stringify(value)}
        onChange={(e) => {
          try {
            onChange(keyPath, JSON.parse(e.target.value));
          } catch {
            // Keep as string while editing
          }
        }}
      />
    );
  }

  // For nested objects, return null (handled by recursion)
  return null;
}

function ConfigObject({
  data,
  keyPath,
  onChange,
  depth = 0,
}: {
  data: Record<string, unknown>;
  keyPath: string;
  onChange: (keyPath: string, val: unknown) => void;
  depth?: number;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const entries = Object.entries(data);

  return (
    <div className={styles.objectEntries}>
      {entries.map(([key, value]) => {
        const fullPath = keyPath ? `${keyPath}.${key}` : key;
        const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);
        const isCollapsed = collapsed[key] ?? (depth >= 2);

        if (isObject) {
          return (
            <div key={key} className={styles.nestedSection}>
              <div
                className={styles.nestedHeader}
                onClick={() => setCollapsed(prev => ({ ...prev, [key]: !isCollapsed }))}
              >
                <span className={styles.collapseIcon}>{isCollapsed ? '▸' : '▾'}</span>
                <span className={styles.nestedKey}>{key}</span>
              </div>
              {!isCollapsed && (
                <div className={styles.nestedBody}>
                  <ConfigObject
                    data={value as Record<string, unknown>}
                    keyPath={fullPath}
                    onChange={onChange}
                    depth={depth + 1}
                  />
                </div>
              )}
            </div>
          );
        }

        return (
          <div key={key} className={styles.fieldRow}>
            <label className={styles.fieldLabel}>{key}</label>
            <div className={styles.fieldValue}>
              <ConfigValue keyPath={fullPath} value={value} onChange={onChange} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ConfigPage() {
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/config');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setConfig(data);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleChange = useCallback((keyPath: string, value: unknown) => {
    setConfig(prev => {
      if (!prev) return prev;
      const newConfig = JSON.parse(JSON.stringify(prev)); // deep clone
      const keys = keyPath.split('.');
      let obj = newConfig;
      for (let i = 0; i < keys.length - 1; i++) {
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      return newConfig;
    });
    setDirty(true);
    setSaveMessage(null);
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaveMessage('✅ 配置已保存');
      setDirty(false);
    } catch (e) {
      setSaveMessage(`❌ 保存失败: ${e instanceof Error ? e.message : '未知错误'}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>加载配置中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>❌ {error}</p>
          <button onClick={loadConfig}>重试</button>
        </div>
      </div>
    );
  }

  if (!config) return null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>⚙️ 配置管理</h2>
        <div className={styles.headerActions}>
          {saveMessage && <span className={styles.saveMessage}>{saveMessage}</span>}
          <button
            className={`${styles.saveButton} ${dirty ? styles.dirty : ''}`}
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>

      <div className={styles.sections}>
        {SECTIONS.map(section => {
          const sectionData = config[section.key];
          if (!sectionData || typeof sectionData !== 'object') return null;

          return (
            <div key={section.key} className={styles.section}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionIcon}>{section.icon}</span>
                <span className={styles.sectionTitle}>{section.label}</span>
              </div>
              <div className={styles.sectionBody}>
                <ConfigObject
                  data={sectionData as Record<string, unknown>}
                  keyPath={section.key}
                  onChange={handleChange}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
