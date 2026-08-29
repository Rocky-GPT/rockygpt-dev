'use client';

import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * BRAIN #3 writes Markdown, so anywhere its answer is drawn as plain text
 * shows the syntax instead of the formatting: a `###` stranded mid-sentence,
 * `**` around every dish, and a numbered list collapsed onto a single line
 * because HTML swallows the newlines a `<p>` was handed.
 *
 * This is the student app's rendering of an answer, minus the parts that are
 * the student app rather than the answer. It deliberately does not port that
 * app's `linkSmartChips` pass, which rewrites room codes and building names
 * into `#map:` chips wired to its map modal: those chips are the UI's
 * additions, and a panel whose purpose is showing what the brain wrote should
 * not quietly show something else.
 *
 * The classes below do all of the work. Both apps hang `prose prose-invert` on
 * the wrapper, but neither installs `@tailwindcss/typography`, so those class
 * names resolve to nothing and every element has to be styled outright —
 * headings included, since Tailwind's preflight resets them to body text.
 */
const components: Components = {
  p: ({ ...props }) => <p className="my-1 leading-relaxed first:mt-0 last:mb-0" {...props} />,
  strong: ({ ...props }) => <strong className="font-semibold text-white" {...props} />,
  em: ({ ...props }) => <em className="italic text-neutral-200" {...props} />,

  // The brain reaches for `###` to head a section (Breakfast, Dinner) and
  // occasionally `##`. Rendered at inherited weight they read as a stray line
  // of body text, which is the same confusion the raw `###` caused.
  h1: ({ ...props }) => (
    <h1 className="mb-1 mt-3 text-[15px] font-semibold text-white first:mt-0" {...props} />
  ),
  h2: ({ ...props }) => (
    <h2 className="mb-1 mt-3 text-sm font-semibold text-white first:mt-0" {...props} />
  ),
  h3: ({ ...props }) => (
    <h3
      className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wider text-sky-300 first:mt-0"
      {...props}
    />
  ),
  h4: ({ ...props }) => (
    <h4 className="mb-1 mt-2.5 text-xs font-semibold text-neutral-200 first:mt-0" {...props} />
  ),

  ul: ({ ...props }) => <ul className="my-1.5 list-disc space-y-0.5 pl-5" {...props} />,
  ol: ({ ...props }) => <ol className="my-1.5 list-decimal space-y-0.5 pl-5" {...props} />,
  li: ({ ...props }) => <li className="leading-relaxed" {...props} />,

  a: ({ href, children, ...props }) => {
    // An in-page anchor here has nothing to land on: the answer was written for
    // a different app's routes. Draw the label, drop the dead link.
    if (!href || href.startsWith('#')) {
      return <span className="text-neutral-200">{children}</span>;
    }
    const external = /^https?:\/\//.test(href);
    return (
      <a
        href={href}
        className="text-sky-400 underline transition-colors hover:text-sky-300"
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        {...props}
      >
        {children}
      </a>
    );
  },

  // `code` covers both spans and fenced blocks — react-markdown stopped
  // passing `inline` at v9 — so the block case is undone on the `pre` instead.
  code: ({ ...props }) => (
    <code
      className="rounded bg-white/10 px-1 py-0.5 font-mono text-[0.85em] text-neutral-100"
      {...props}
    />
  ),
  pre: ({ ...props }) => (
    <pre
      className="my-2 overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs [&>code]:bg-transparent [&>code]:p-0"
      {...props}
    />
  ),

  table: ({ ...props }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full border-collapse text-xs" {...props} />
    </div>
  ),
  thead: ({ ...props }) => <thead className="bg-white/5" {...props} />,
  th: ({ ...props }) => (
    <th className="border border-white/10 px-2.5 py-1.5 text-left font-semibold text-white" {...props} />
  ),
  td: ({ ...props }) => <td className="border border-white/10 px-2.5 py-1.5" {...props} />,

  blockquote: ({ ...props }) => (
    <blockquote className="my-2 border-l-2 border-white/15 pl-3 text-neutral-300" {...props} />
  ),
  hr: () => <hr className="my-3 border-white/10" />,
};

interface BrainMarkdownProps {
  /** The answer exactly as the brain returned it. */
  children: string;
}

export function BrainMarkdown({ children }: BrainMarkdownProps) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
}
