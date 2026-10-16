import ReactMarkdown from 'react-markdown';

interface MarkdownRendererProps {
  children: string;
}

export function MarkdownRenderer({ children }: MarkdownRendererProps) {
  return (
    <div className="text-sm">
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 className="mt-4 mb-2 text-xl font-semibold text-app-text">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-4 mb-2 text-lg font-semibold text-app-text">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-4 mb-2 text-base font-semibold text-app-text">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="mb-3 text-sm leading-relaxed text-app-text">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="mb-3 list-inside list-disc space-y-1 text-sm text-app-text">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 list-inside list-decimal space-y-1 text-sm text-app-text">{children}</ol>
          ),
          li: ({ children }) => <li>{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-app-text">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ children, href }) => (
            <a href={href} className="text-app-accent underline">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
