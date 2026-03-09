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
 * FencedCodeBlock — renders the <pre> wrapper for fenced code blocks.
 *
 * react-markdown calls: components.pre → wraps → components.code
 * So children here is <CodeElement className="language-xxx">...</CodeElement>
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

  // Extract plain text for copy (strip trailing newline)
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
 * CodeElement — handles both inline code and fenced code block's inner <code>.
 *
 * For fenced code blocks: wrapped inside FencedCodeBlock's <pre>, className
 * may contain "language-xxx" or "hljs". Styling is handled by `.codeBlock code` CSS.
 *
 * For inline code: standalone <code>, gets `.inlineCode` class.
 *
 * Distinction: fenced code blocks always have a className (from rehype-highlight
 * or react-markdown's language- prefix). Inline code has no className.
 * Exception: plain ``` blocks without language — but those are still wrapped
 * in <pre> (FencedCodeBlock), so even without className they render correctly
 * via `.codeBlock code` CSS. We add inlineCode class only when no className
 * is present, which is fine because inside .codeBlock the more specific
 * `.codeBlock code` selector overrides `.inlineCode` anyway.
 *
 * Actually, the simplest approach: never add inlineCode class inside a code block.
 * We detect "inside pre" by checking if node's parent is pre (via the node prop).
 */
function CodeElement({
  children,
  className,
  node: _node,
  ...props
}: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode; node?: unknown }) {
  // If className exists, this is likely a fenced code block's <code> (has language-xxx or hljs)
  // Render plain <code> and let .codeBlock code CSS handle it
  if (className) {
    return <code className={className} {...props}>{children}</code>;
  }

  // No className: could be inline code OR plain fenced block (``` without language).
  // For plain fenced blocks, FencedCodeBlock wraps this in <pre>, and
  // .codeBlock code CSS will style it correctly regardless of inlineCode class.
  // So we can safely add inlineCode class — it will be overridden by .codeBlock code.
  return <code className={styles.inlineCode} {...props}>{children}</code>;
}

const components: Partial<Components> = {
  pre: FencedCodeBlock as Components['pre'],
  code: CodeElement as Components['code'],
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
