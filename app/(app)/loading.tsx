export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex min-h-[55vh] items-center justify-center"
    >
      <div className="win w-72 max-w-full">
        <div className="win-bar win-bar--violet">
          <span className="text-[15px] font-bold text-ink">Loading…</span>
          <span
            className="crm-spinner text-ink"
            style={{ fontSize: "15px" }}
            aria-hidden="true"
          />
        </div>
        <div className="flex flex-col items-center gap-4 p-6">
          <div className="crm-progress w-full" />
          <span className="text-sm font-semibold text-muted">One moment…</span>
        </div>
      </div>
    </div>
  );
}
