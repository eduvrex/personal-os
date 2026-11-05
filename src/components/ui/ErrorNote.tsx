/** Inline load-failure notice — distinguishes "failed" from "empty". */
export function ErrorNote({
  message,
  onRetry,
}: {
  message?: string | null;
  onRetry?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-[3px] border border-danger/20 bg-danger/[0.06] px-3 py-2 text-xs text-danger">
      <span className="min-w-0 break-words">
        Couldn&apos;t load{message ? ` — ${message}` : "."}
      </span>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="shrink-0 underline">
          Retry
        </button>
      ) : null}
    </div>
  );
}
