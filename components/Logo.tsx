/**
 * MyCRM logo — a little book with a smiley face (a friendly "book of people"),
 * in the cute-OS palette: white cover, soft-indigo outline + spine, a pastel
 * bookmark ribbon. Colours are fixed so it reads on any pastel chip.
 */
export function Logo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      {/* cover */}
      <rect
        x="7"
        y="4.5"
        width="18.5"
        height="23"
        rx="3"
        fill="#ffffff"
        stroke="#413f63"
        strokeWidth="2.4"
      />
      {/* spine / binding */}
      <path d="M11 5.4V26.6" stroke="#413f63" strokeWidth="1.6" />
      {/* bookmark ribbon poking out the top */}
      <path
        d="M19.8 3.2v6.4l1.75-1.5 1.75 1.5V3.2"
        fill="#f6cedc"
        stroke="#413f63"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* face */}
      <circle cx="16" cy="15.2" r="1.4" fill="#413f63" />
      <circle cx="20.4" cy="15.2" r="1.4" fill="#413f63" />
      <path
        d="M15.4 19c1.3 1.7 4.3 1.7 5.6 0"
        stroke="#413f63"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
