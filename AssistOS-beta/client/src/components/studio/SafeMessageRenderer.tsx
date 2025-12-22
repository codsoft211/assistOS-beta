import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import CodeBlock from "./CodeBlock";

interface SafeMessageRendererProps {
  content: string;
  messageId: string;
  isStreaming?: boolean;
}

export default function SafeMessageRenderer({
  content,
  messageId,
  isStreaming = false,
}: SafeMessageRendererProps) {
  // Memoize markdown rendering to avoid re-rendering during streaming
  const renderedContent = useMemo(() => {
    try {
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none break-words">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{
              code: ({ inline, className, children, ...props }) => {
                if (inline) {
                  return (
                    <code
                      className="bg-muted rounded px-1.5 py-0.5 font-mono text-sm"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                }

                const match = /language-(\w+)/.exec(className || "");
                const language = match ? match[1] : "";

                return (
                  <CodeBlock
                    language={language}
                    code={String(children).replace(/\n$/, "")}
                    messageId={messageId}
                  />
                );
              },
              pre: ({ children }) => <>{children}</>,
              // Style blockquotes
              blockquote: ({ children }) => (
                <blockquote className="border-l-4 border-muted pl-3 italic text-muted-foreground">
                  {children}
                </blockquote>
              ),
              // Style lists
              ul: ({ children }) => (
                <ul className="list-disc list-inside space-y-1">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal list-inside space-y-1">
                  {children}
                </ol>
              ),
              // Style links
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {children}
                </a>
              ),
              // Style tables
              table: ({ children }) => (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-border">
                    {children}
                  </table>
                </div>
              ),
              th: ({ children }) => (
                <th className="border border-border bg-muted px-3 py-2 text-left font-semibold">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="border border-border px-3 py-2">{children}</td>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      );
    } catch (error) {
      console.error(`[SafeMessageRenderer] Error rendering message ${messageId}:`, error);
      // Fallback: render as plain text with line breaks
      return (
        <div className="text-sm whitespace-pre-wrap break-words max-w-[85%] rounded-lg px-3 py-2 bg-accent">
          {content}
        </div>
      );
    }
  }, [content, messageId]);

  return (
    <div
      className="max-w-[85%] rounded-lg px-3 py-2 bg-accent text-accent-foreground break-words"
      data-testid={`message-${messageId}`}
    >
      {renderedContent}
    </div>
  );
}
