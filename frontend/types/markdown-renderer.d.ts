declare module "katex/contrib/auto-render" {
  type Delimiter = {
    left: string;
    right: string;
    display: boolean;
  };

  type AutoRenderOptions = {
    delimiters?: Delimiter[];
    ignoredTags?: string[];
    throwOnError?: boolean;
  };

  export default function renderMathInElement(element: HTMLElement, options?: AutoRenderOptions): void;
}

declare module "markdown-it-footnote" {
  import type MarkdownIt from "markdown-it";

  const markdownItFootnote: MarkdownIt.PluginSimple;
  export default markdownItFootnote;
}

declare module "markdown-it-task-lists" {
  import type MarkdownIt from "markdown-it";

  const markdownItTaskLists: MarkdownIt.PluginWithOptions<{
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }>;
  export default markdownItTaskLists;
}
