import { useState, useRef, useEffect } from "react";
import { Check, Copy } from "lucide-react";

// Custom code block component with copy button
const CodeBlock = ({ node, inline, className, children, ...props }: any) => {
    const [copied, setCopied] = useState(false);
    const codeRef = useRef<HTMLElement>(null);
    
    // Extract text content from code element
    const getCodeText = () => {
      if (codeRef.current) {
        return codeRef.current.textContent || '';
      }
      // Fallback: try to extract from children
      if (typeof children === 'string') {
        return children;
      }
      if (Array.isArray(children)) {
        return children.map((child: any) => {
          if (typeof child === 'string') return child;
          if (child?.props?.children) {
            return String(child.props.children);
          }
          return String(child);
        }).join('');
      }
      return String(children);
    };
    
    const handleCopy = async () => {
      try {
        const code = getCodeText();
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    };
  
    if (inline) {
      return <code className={className} {...props}>{children}</code>;
    }
  
    return (
      <div className="relative group">
        <pre className={className} {...props}>
          <code ref={codeRef}>{children}</code>
        </pre>
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 p-1.5 rounded-md bg-muted/80 hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity border border-border/50"
          title={copied ? "Copied!" : "Copy code"}
          aria-label="Copy code"
        >
          {copied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Copy className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </div>
    );
  };


export default CodeBlock;