import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { cn } from "@/lib/utils";

/**
 * Safe markdown rendering (§14.2). Raw HTML is stripped via rehype-sanitize;
 * no dangerouslySetInnerHTML is used anywhere. Links open in a new tab with
 * a safe rel.
 */
export function Markdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none dark:prose-invert break-words",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer nofollow"
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
