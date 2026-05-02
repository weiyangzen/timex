"use client";

import renderMathInElement from "katex/contrib/auto-render";
import MarkdownIt from "markdown-it";
import markdownItFootnote from "markdown-it-footnote";
import markdownItTaskLists from "markdown-it-task-lists";
import { useEffect, useMemo, useRef } from "react";

const markdown = createMarkdownRenderer();

function createMarkdownRenderer() {
  const instance = new MarkdownIt({
    breaks: true,
    html: false,
    linkify: true,
    typographer: true
  });

  instance.use(markdownItFootnote);
  instance.use(markdownItTaskLists, {
    enabled: true,
    label: true,
    labelAfter: true
  });

  const defaultLinkOpen =
    instance.renderer.rules.link_open?.bind(instance.renderer) ??
    ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));

  instance.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const href = token.attrGet("href") ?? "";
    if (/^https?:\/\//i.test(href)) {
      token.attrSet("target", "_blank");
      token.attrSet("rel", "noreferrer noopener");
    }
    return defaultLinkOpen(tokens, index, options, env, self);
  };

  return instance;
}

function normalizeChatMarkdown(value: string): string {
  return String(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+---[ \t]+/g, "\n\n---\n\n")
    .replace(/[ \t]+(\*\*\d+\.\s)/g, "\n\n$1")
    .replace(/[ \t]+-[ \t]+(?=\S)/g, "\n- ");
}

type MarkdownMessageProps = {
  content: string;
};

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const rendered = useMemo(() => {
    try {
      return markdown.render(normalizeChatMarkdown(content));
    } catch {
      return markdown.utils.escapeHtml(content);
    }
  }, [content]);

  useEffect(() => {
    if (!rootRef.current) return;
    renderMathInElement(rootRef.current, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\[", right: "\\]", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\(", right: "\\)", display: false }
      ],
      ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
      throwOnError: false
    });
  }, [rendered]);

  return <div ref={rootRef} className="markdownMessage" dangerouslySetInnerHTML={{ __html: rendered }} />;
}
