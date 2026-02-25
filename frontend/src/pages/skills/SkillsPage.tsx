import { useState, useEffect, useCallback } from 'react';
import MarkdownRenderer from '@/components/Markdown/MarkdownRenderer';
import styles from './SkillsPage.module.css';

interface Skill {
  name: string;
  description: string;
  location: string;
  source: 'user' | 'builtin';
  available: boolean;
}

interface TreeItem {
  path: string;
  type: 'file' | 'dir';
  size?: number;
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [activeSkill, setActiveSkill] = useState<string | null>(null);
  const [skillContent, setSkillContent] = useState<string>('');
  const [tree, setTree] = useState<TreeItem[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTree, setShowTree] = useState(true);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/skills');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSkills(data.skills || []);
      if (data.skills?.length > 0 && !activeSkill) {
        setActiveSkill(data.skills[0].name);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [activeSkill]);

  const loadSkillDetail = useCallback(async (name: string) => {
    setLoadingDetail(true);
    setActiveFile(null);
    setFileContent('');
    try {
      const [detailRes, treeRes] = await Promise.all([
        fetch(`/api/skills/${encodeURIComponent(name)}`),
        fetch(`/api/skills/${encodeURIComponent(name)}/tree`),
      ]);

      if (detailRes.ok) {
        const detail = await detailRes.json();
        setSkillContent(detail.content || '');
      } else {
        setSkillContent('❌ 加载失败');
      }

      if (treeRes.ok) {
        const treeData = await treeRes.json();
        setTree(treeData.tree || []);
      } else {
        setTree([]);
      }
    } catch (e) {
      setSkillContent(`❌ ${e instanceof Error ? e.message : '加载失败'}`);
      setTree([]);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const loadFile = useCallback(async (skillName: string, filePath: string) => {
    setLoadingFile(true);
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skillName)}/files/${filePath}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFileContent(data.binary ? '(二进制文件，无法显示)' : data.content || '');
    } catch (e) {
      setFileContent(`❌ ${e instanceof Error ? e.message : '加载失败'}`);
    } finally {
      setLoadingFile(false);
    }
  }, []);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  useEffect(() => {
    if (activeSkill) {
      loadSkillDetail(activeSkill);
    }
  }, [activeSkill, loadSkillDetail]);

  const handleFileClick = (filePath: string) => {
    if (!activeSkill) return;
    setActiveFile(filePath);
    loadFile(activeSkill, filePath);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const getFileIcon = (path: string) => {
    if (path.endsWith('.md')) return '📝';
    if (path.endsWith('.py')) return '🐍';
    if (path.endsWith('.sh')) return '🔧';
    if (path.endsWith('.swift')) return '🍎';
    if (path.endsWith('.ts') || path.endsWith('.tsx')) return '📘';
    if (path.endsWith('.js') || path.endsWith('.jsx')) return '📒';
    if (path.endsWith('.json')) return '📋';
    if (path.endsWith('.css')) return '🎨';
    return '📄';
  };

  const getFileExtension = (path: string) => {
    const name = path.split('/').pop() || path;
    const ext = name.split('.').pop();
    if (!ext || ext === name) return '';
    return ext;
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>❌ {error}</p>
          <button onClick={loadSkills}>重试</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Sidebar: Skill list */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span>🔧 Skills</span>
        </div>
        <div className={styles.skillList}>
          {skills.map(skill => (
            <div
              key={skill.name}
              className={`${styles.skillItem} ${activeSkill === skill.name ? styles.active : ''}`}
              onClick={() => setActiveSkill(skill.name)}
            >
              <div className={styles.skillName}>
                <span className={styles.availableIcon}>
                  {skill.available ? '✅' : '❌'}
                </span>
                {skill.name}
              </div>
              <div className={styles.skillSource}>
                {skill.source === 'user' ? '自定义' : '内置'}
              </div>
            </div>
          ))}
          {skills.length === 0 && (
            <div className={styles.empty}>暂无 Skills</div>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className={styles.content}>
        {activeSkill ? (
          <>
            <div className={styles.contentHeader}>
              <span className={styles.contentTitle}>🔧 {activeSkill}</span>
              <span className={styles.sourceBadge}>
                {skills.find(s => s.name === activeSkill)?.source === 'user' ? '自定义' : '内置'}
              </span>
            </div>

            <div className={styles.contentBody}>
              {loadingDetail ? (
                <div className={styles.loading}>加载中...</div>
              ) : (
                <>
                  {/* SKILL.md content */}
                  <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                      <span>📖 说明文档</span>
                    </div>
                    <div className={styles.sectionBody}>
                      <MarkdownRenderer content={skillContent} />
                    </div>
                  </div>

                  {/* Directory tree */}
                  {tree.length > 0 && (
                    <div className={styles.section}>
                      <div
                        className={styles.sectionHeader}
                        onClick={() => setShowTree(!showTree)}
                        style={{ cursor: 'pointer' }}
                      >
                        <span>{showTree ? '▾' : '▸'} 📁 目录结构</span>
                      </div>
                      {showTree && (
                        <div className={styles.treeBody}>
                          {tree.map(item => (
                            <div
                              key={item.path}
                              className={`${styles.treeItem} ${item.type === 'file' ? styles.treeFile : styles.treeDir} ${activeFile === item.path ? styles.treeActive : ''}`}
                              style={{ paddingLeft: `${(item.path.split('/').length - 1) * 16 + 12}px` }}
                              onClick={() => item.type === 'file' && handleFileClick(item.path)}
                            >
                              <span className={styles.treeIcon}>
                                {item.type === 'dir' ? '📁' : getFileIcon(item.path)}
                              </span>
                              <span className={styles.treeName}>
                                {item.path.split('/').pop()}
                              </span>
                              {item.type === 'file' && item.size !== undefined && (
                                <span className={styles.treeSize}>{formatSize(item.size)}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* File viewer */}
                  {activeFile && (
                    <div className={styles.section}>
                      <div className={styles.sectionHeader}>
                        <span>📄 {activeFile}</span>
                        <span className={styles.readonlyBadge}>只读</span>
                      </div>
                      <div className={styles.fileViewer}>
                        {loadingFile ? (
                          <div className={styles.loading}>加载中...</div>
                        ) : (
                          getFileExtension(activeFile) === 'md' ? (
                            <MarkdownRenderer content={fileContent} />
                          ) : (
                            <pre className={styles.codeContent}>{fileContent}</pre>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <div className={styles.empty}>选择一个 Skill 查看详情</div>
        )}
      </div>
    </div>
  );
}
