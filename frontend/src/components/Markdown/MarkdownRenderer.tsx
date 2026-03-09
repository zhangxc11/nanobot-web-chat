import { useCallback, useState, isValidElement, Children } from 'react';
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

/**
 * FencedCodeBlock — renders the <pre> wrapper for fenced code blocks (``` ... ```).
 * The inner <code> is rendered as a plain element (not the InlineCode component)
 * because react-markdown calls components.pre for fenced blocks, wrapping components.code.
 * We handle the full code block UI here: header, copy button, and code content.
 */
function FencedCodeBlock({ children, ...props }: React.HTMLAttributes<HTMLPreElement> & { children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);

  // Extract language from the inner <code> element's className
  let lang = '';
  const childArray = Children.toArray(children);
  if (childArray.length === 1 && isValidElement(childArray[0])) {
    const codeEl = childArray[0] as React.ReactElement<{ className?: string; children?: React.ReactNode }>;
    const match = /language-(\w+)/.exec(codeEl.props.className || '');
    lang = match ? match[1] : '';
  }

  // Extract plain text for copy
  const codeStr = extractText(children).replace(/\n$/, '');

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(codeStr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [codeStr]);

  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeHeader}>
        <span className={styles.codeLang}>{lang}</span>
        <button className={styles.copyButton} onClick={handleCopy}>
          {copied ? '✓ 已复制' : '复制'}
        </button>
      </div>
      <pre className={styles.codeBlockPre} {...props}>
        {children}
      </pre>
    </div>
  );
}

/**
 * InlineCode — renders inline `code` spans only.
 * Fenced code blocks are fully handled by FencedCodeBlock (components.pre).
 */
function InlineCode({ children, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) {
  return <code className={styles.inlineCode} {...props}>{children}</code>;
}

const components: Partial<Components> = {
  pre: FencedCodeBlock as Components['pre'],
  code: InlineCode as Components['code'],
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
