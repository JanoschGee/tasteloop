import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { obsidianToMarkdown, type LinkTargets } from "@/lib/markdown";

/** Renders vault Markdown. Raw HTML is not executed (react-markdown without rehype-raw). */
export function Markdown({ text, targets }: { text: string; targets: LinkTargets }) {
  return (
    <div className="prose-ab">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children }) {
            const lang = /language-(\w+)/.exec(className ?? "")?.[1];
            if (lang === "diff") {
              return (
                <code>
                  {String(children)
                    .replace(/\n$/, "")
                    .split("\n")
                    .map((line, i) => (
                      <span key={i} className={line.startsWith("+") ? "diff-add" : line.startsWith("-") ? "diff-del" : "block"}>
                        {line || " "}
                      </span>
                    ))}
                </code>
              );
            }
            return <code className={className}>{children}</code>;
          },
          img({ src, alt }) {
            // eslint-disable-next-line @next/next/no-img-element
            return <img src={typeof src === "string" ? src : ""} alt={alt ?? ""} loading="lazy" />;
          },
        }}
      >
        {obsidianToMarkdown(text, targets)}
      </ReactMarkdown>
    </div>
  );
}
