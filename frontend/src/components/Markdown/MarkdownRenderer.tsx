import { useCallback, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import type { Components } from 'react-markdown';
import { common, createLowlight } from 'lowlight';
import 'highlight.js/styles/github-dark.css';
import styles from './MarkdownRenderer.module.css';

// Use common languages only (~40 languages) instead of all (~190)
const lowlight = createLowlight(common);

interface MarkdownRendererProps {
  content: string;
}

/** Recursively extract plain text from React nodes (handles rehype-highlight spans) */
function extractText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (!node) return '';
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (typeof node === 'object' && 'props' in node) {
    const el = node as React.ReactElement<{ children?: React.ReactNode }>;
    return extractText(el.props.children);
  }
  return '';
}

function CodeBlock({ className, children, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : '';
  const codeStr = extractText(children).replace(/\n$/, '');

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(codeStr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [codeStr]);

  // Inline code (no language class, short)
  if (!className) {
    return <code className={styles.inlineCode} {...props}>{children}</code>;
  }

  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeHeader}>
        <span className={styles.codeLang}>{lang}</span>
        <button className={styles.copyButton} onClick={handleCopy}>
          {copied ? '✓ 已复制' : '复制'}
        </button>
      </div>
      <code className={className} {...props}>
        {children}
      </code>
    </div>
  );
}

const components: Partial<Components> = {
  pre({ children }) {
    return <>{children}</>;
  },
  code: CodeBlock as Components['code'],
};

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[[rehypeHighlight, { lowlight }]]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
