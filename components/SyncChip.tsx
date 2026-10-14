import Link from "next/link";
import { timeAgo } from "@/lib/date";

/** Header chip showing Microsoft sync status. */
export function SyncChip({
  connected,
  lastSyncAt,
  lastError,
}: {
  connected: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
}) {
  if (!connected) {
    return (
      <Link
        href="/settings"
        className="rounded-full border-2 border-ink bg-accent px-3 py-1 text-xs font-bold text-accent-fg transition hover:-translate-y-px"
      >
        Connect Microsoft
      </Link>
    );
  }

  if (lastError) {
    return (
      <Link
        href="/settings"
        className="rounded-full border-2 border-crit/40 bg-critbg px-3 py-1 text-xs font-bold text-crit"
        title={lastError}
      >
        Sync error
      </Link>
    );
  }

  const stale =
    !lastSyncAt ||
    Date.now() - new Date(lastSyncAt).getTime() > 2 * 60 * 60 * 1000;

  return (
    <span
      className={`rounded-full border-2 border-ink px-3 py-1 text-xs font-bold text-ink ${
        stale ? "bg-bary" : "bg-barm"
      }`}
    >
      {lastSyncAt ? `Synced ${timeAgo(lastSyncAt)}` : "Not synced yet"}
    </span>
  );
}
