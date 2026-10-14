import type { SVGProps } from "react";

/** Shared line-icon base — consistent stroke, rounded joins, inherits color. */
function Base({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function MailIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m3.6 7.5 8.4 5.4 8.4-5.4" />
    </Base>
  );
}

export function PhoneIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M6.4 3.5h3l1.5 4-2 1.4a12 12 0 0 0 5 5l1.4-2 4 1.5v3a2 2 0 0 1-2.1 2A16 16 0 0 1 4.4 5.6a2 2 0 0 1 2-2.1Z" />
    </Base>
  );
}

export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-3.7-3.7" />
    </Base>
  );
}

export function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M12 5.5v13M5.5 12h13" />
    </Base>
  );
}

export function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Base>
  );
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Base>
  );
}

export function CoffeeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M4 8h13v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Z" />
      <path d="M17 9h2.4a2.5 2.5 0 0 1 0 5H17" />
      <path d="M8 3.6c-.4.7-.4 1.5 0 2.2M12 3.6c-.4.7-.4 1.5 0 2.2" />
    </Base>
  );
}

export function HomeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="m4 11 8-7 8 7" />
      <path d="M6 10v9h12v-9" />
    </Base>
  );
}

export function InboxIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="M3.6 13.5H8l1.5 2.5h5l1.5-2.5h4.4" />
    </Base>
  );
}

export function PinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M9 3.5h6l-1 5 3 3H7l3-3-1-5Z" />
      <path d="M12 14.5V21" />
    </Base>
  );
}

export function FlameIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M12 22a6 6 0 0 0 6-6c0-4-4-5.5-4-10-3 2-4.5 5-4.5 7.5-1.2 0-2-1-2.2-2.3C5.7 12.6 6 14 6 16a6 6 0 0 0 6 6Z" />
    </Base>
  );
}

export function SparkleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M12 3.5 13.7 9 19 10.5 13.7 12 12 17.5 10.3 12 5 10.5 10.3 9Z" />
      <path d="M18.5 4v3M20 5.5h-3" />
    </Base>
  );
}

export function AlertIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M10.3 3.9 2.5 17.9a1.9 1.9 0 0 0 1.7 2.9h15.6a1.9 1.9 0 0 0 1.7-2.9L13.7 3.9a1.9 1.9 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </Base>
  );
}

export function WrenchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M15 6.5a3.6 3.6 0 0 0-4.7 4.6l-6.1 6.1a1.7 1.7 0 0 0 2.4 2.4l6.1-6.1A3.6 3.6 0 0 0 17.3 8.8l-2.2 2.2-1.9-.4-.4-1.9L15 6.5Z" />
    </Base>
  );
}

export function FunnelIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M3 5h18l-7 8v6l-4-2v-4L3 5Z" />
    </Base>
  );
}

export function SproutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M12 21v-9" />
      <path d="M12 12C12 8.5 9.5 6 6 6c-1 0-1.7.2-1.7.2s-.2.7-.2 1.8C4.1 11.5 6.6 14 10 14c1 0 2-.3 2-.3" />
      <path d="M12 13c0-3 2.2-5.2 5.2-5.2.9 0 1.5.2 1.5.2s.2.6.2 1.5C18.9 12.5 16.7 14.5 14 14.5c-.9 0-2-.3-2-.3" />
    </Base>
  );
}

export function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.2l2.8 1.8" />
    </Base>
  );
}

export function UsersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 6a3 3 0 0 1 0 5.8" />
      <path d="M16.5 14.5a5.5 5.5 0 0 1 4 4.5" />
    </Base>
  );
}

export function PencilIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M4 20.5h4L18.6 9.9a2 2 0 0 0-2.8-2.8L5 17.5z" />
      <path d="m14 8.5 3 3" />
    </Base>
  );
}

export function LinkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="m9.5 14.5 5-5" />
      <path d="M8.5 12 6.7 13.8a3.3 3.3 0 0 0 4.7 4.7L13 16.7" />
      <path d="M15.5 12l1.8-1.8a3.3 3.3 0 0 0-4.7-4.7L11 7.3" />
    </Base>
  );
}

export function SlidersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M4 8h9M17.5 8H20" />
      <circle cx="15" cy="8" r="2.2" />
      <path d="M4 16h2.5M11 16h9" />
      <circle cx="8.5" cy="16" r="2.2" />
    </Base>
  );
}

export function BellIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M6.5 16.5c1-1 1.5-2.1 1.5-4.2V11a4 4 0 0 1 8 0v1.3c0 2.1.5 3.2 1.5 4.2z" />
      <path d="M10.2 19a2 2 0 0 0 3.6 0" />
      <path d="M12 4.5V3.2" />
    </Base>
  );
}

export function MicIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v3.5" />
    </Base>
  );
}

export function GearIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M17 17l1.6 1.6M18.4 5.6 16.8 7.2M7.2 16.8 5.6 18.4" />
    </Base>
  );
}

/** LinkedIn glyph — filled (recognisable at small sizes). */
export function LinkedinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}
