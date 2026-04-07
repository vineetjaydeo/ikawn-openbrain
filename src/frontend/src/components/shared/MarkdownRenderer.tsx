import { useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript'
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript'
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash'
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json'
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python'
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css'
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql'
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown'
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx'
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx'
import { Copy, Check } from 'lucide-react'

SyntaxHighlighter.registerLanguage('javascript', javascript)
SyntaxHighlighter.registerLanguage('js', javascript)
SyntaxHighlighter.registerLanguage('typescript', typescript)
SyntaxHighlighter.registerLanguage('ts', typescript)
SyntaxHighlighter.registerLanguage('bash', bash)
SyntaxHighlighter.registerLanguage('shell', bash)
SyntaxHighlighter.registerLanguage('json', json)
SyntaxHighlighter.registerLanguage('python', python)
SyntaxHighlighter.registerLanguage('css', css)
SyntaxHighlighter.registerLanguage('sql', sql)
SyntaxHighlighter.registerLanguage('markdown', markdown)
SyntaxHighlighter.registerLanguage('md', markdown)
SyntaxHighlighter.registerLanguage('jsx', jsx)
SyntaxHighlighter.registerLanguage('tsx', tsx)
import { cn } from '@/lib/utils'

interface MarkdownRendererProps {
  content: string
  className?: string
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'absolute top-2 right-2 z-10 flex items-center gap-1 rounded px-1.5 py-1',
        'bg-[rgb(30,30,30)]/90 border border-[hsl(var(--border))]',
        'text-[var(--text-secondary)] text-xs cursor-pointer',
        'opacity-0 group-hover:opacity-100 transition-opacity',
        'hover:text-[var(--text)] hover:bg-[rgb(50,50,50)]/95',
        copied && 'text-green-500 border-green-500/25'
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      className={cn('markdown-content', className)}
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className: codeClassName, children, ...props }) {
          const match = /language-(\w+)/.exec(codeClassName || '')
          const codeString = String(children).replace(/\n$/, '')

          if (match) {
            return (
              <div className="relative group my-2.5">
                <CopyButton text={codeString} />
                <SyntaxHighlighter
                  style={oneDark}
                  language={match[1]}
                  PreTag="pre"
                  customStyle={{
                    background: 'var(--surface-1)',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 'calc(var(--radius) - 4px)',
                    margin: 0,
                    padding: '1rem',
                    fontSize: '0.88em',
                    lineHeight: 1.55,
                  }}
                >
                  {codeString}
                </SyntaxHighlighter>
              </div>
            )
          }

          return (
            <code
              className={cn(
                'bg-[rgb(30,30,30)] px-1.5 py-0.5 rounded text-[0.88em]',
                'font-mono',
                codeClassName
              )}
              {...props}
            >
              {children}
            </code>
          )
        },
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--gold)] hover:underline"
            >
              {children}
            </a>
          )
        },
        img({ src, alt }) {
          return (
            <img
              src={src}
              alt={alt || ''}
              className="rounded-lg max-w-full my-2 inline-block"
              loading="lazy"
            />
          )
        },
        table({ children }) {
          return (
            <div className="overflow-x-auto my-2">
              <table className="w-full border-collapse">
                {children}
              </table>
            </div>
          )
        },
        th({ children }) {
          return (
            <th className="border border-[hsl(var(--border))] px-3 py-1.5 text-left text-[0.9em] font-semibold bg-[hsl(var(--input))] text-[var(--text-secondary)]">
              {children}
            </th>
          )
        },
        td({ children }) {
          return (
            <td className="border border-[hsl(var(--border))] px-3 py-1.5 text-left text-[0.9em]">
              {children}
            </td>
          )
        },
        tr({ children, ...props }) {
          return (
            <tr className="even:bg-[rgb(15,15,15)]" {...props}>
              {children}
            </tr>
          )
        },
        blockquote({ children }) {
          return (
            <blockquote className="border-l-[3px] border-l-[var(--gold)] pl-3.5 py-3 my-2 bg-[#111] rounded-r-sm text-[var(--text)]">
              {children}
            </blockquote>
          )
        },
        hr() {
          return <hr className="border-none border-t border-t-[hsl(var(--border))] my-4" />
        },
        p({ children }) {
          return <p className="mb-2.5 last:mb-0">{children}</p>
        },
        ul({ children }) {
          return <ul className="pl-5 mb-2.5 list-disc">{children}</ul>
        },
        ol({ children }) {
          return <ol className="pl-5 mb-2.5 list-decimal">{children}</ol>
        },
        li({ children }) {
          return <li className="mb-1">{children}</li>
        },
        h1({ children }) {
          return <h1 className="text-xl font-bold mt-4 mb-1.5 font-display text-[var(--text)] tracking-tight">{children}</h1>
        },
        h2({ children }) {
          return <h2 className="text-lg font-semibold mt-3.5 mb-1.5 font-display text-[var(--text)]">{children}</h2>
        },
        h3({ children }) {
          return <h3 className="text-base font-semibold mt-3 mb-1 text-[var(--text)]">{children}</h3>
        },
        h4({ children }) {
          return <h4 className="text-sm font-semibold mt-2.5 mb-1 text-[var(--text-secondary)]">{children}</h4>
        },
        strong({ children }) {
          return <strong className="text-[var(--text)] font-semibold">{children}</strong>
        },
        input({ checked, ...props }) {
          return (
            <input
              type="checkbox"
              checked={checked}
              readOnly
              className="mr-1.5 accent-[var(--gold)]"
              {...props}
            />
          )
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
