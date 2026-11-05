import { Panel } from "@/components/ui/Panel";

/** Stand-in page for tabs we'll flesh out later. */
export function PlaceholderPage({
  title,
  blurb,
}: {
  title: string;
  blurb: string;
}) {
  return (
    <Panel title={title}>
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center">
        <h1 className="text-lg font-medium text-ink-4">{title}</h1>
        <p className="max-w-sm text-sm text-ink-3">{blurb}</p>
        <span className="mt-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[10px] uppercase tracking-wider text-ink-3">
          Coming soon
        </span>
      </div>
    </Panel>
  );
}
