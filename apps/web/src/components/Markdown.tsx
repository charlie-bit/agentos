/**
 * Streamed markdown via streamdown (public OSS), behind React.lazy so the
 * highlighter ships in its own chunk (bundle discipline).
 */
import { lazy, Suspense } from "react";
import "streamdown/styles.css";

const Streamdown = lazy(() => import("streamdown").then((m) => ({ default: m.Streamdown })));

export function Markdown({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <Suspense
      fallback={<pre className="font-mono text-[13px] whitespace-pre-wrap">{text}</pre>}
    >
      <Streamdown mode={streaming ? "streaming" : "static"}>{text}</Streamdown>
    </Suspense>
  );
}
