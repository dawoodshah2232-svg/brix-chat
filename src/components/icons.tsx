// Brix Chat — original professional stroke icon set (marketing surfaces).
// Consistent 24x24 grid, 1.8 stroke, round caps. Use with a text-* color class.

import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

function base(props: P) {
  return {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props,
  };
}

export function ChatIcon(props: P) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4" width="18" height="13" rx="4" />
      <path d="M8.5 20.5 10 17" />
      <path d="M7.5 9h9M7.5 12.5h5.5" />
    </svg>
  );
}

export function SparkIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18l-1.8-5.4L4.5 10.8 10.2 9 12 3.5Z" />
      <path d="M18.6 15.4l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" />
    </svg>
  );
}

export function EyeIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M2.8 12S6.2 5.8 12 5.8 21.2 12 21.2 12 17.8 18.2 12 18.2 2.8 12 2.8 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

export function BoltIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M13 2.8 5 13.2h6L10 21.2l8.5-10.8h-6L13 2.8Z" />
    </svg>
  );
}

export function GlobeIcon(props: P) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M3.4 12h17.2" />
      <path d="M12 3.4c2.4 2.5 3.7 5.4 3.7 8.6s-1.3 6.1-3.7 8.6c-2.4-2.5-3.7-5.4-3.7-8.6S9.6 5.9 12 3.4Z" />
    </svg>
  );
}

export function BookIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M12 6.8C10.2 5.2 7.5 4.8 4.5 5.3v13.2c3-.5 5.7-.1 7.5 1.5 1.8-1.6 4.5-2 7.5-1.5V5.3c-3-.5-5.7-.1-7.5 1.5Z" />
      <path d="M12 6.8V20" />
    </svg>
  );
}

export function BellIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M17.8 9.2a5.8 5.8 0 1 0-11.6 0c0 4.8-1.9 5.8-1.9 5.8h15.4s-1.9-1-1.9-5.8" />
      <path d="M10.2 19.4a2.1 2.1 0 0 0 3.6 0" />
    </svg>
  );
}

export function ShieldIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.2 19.2 6v5.3c0 4.4-3 7.5-7.2 9.2-4.2-1.7-7.2-4.8-7.2-9.2V6L12 3.2Z" />
      <path d="m9.2 11.4 2.1 2.1 3.6-4" />
    </svg>
  );
}

export function PenIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M4.5 19.5l.9-3.8L16 5.1a2 2 0 0 1 2.9 2.9L8.3 18.6l-3.8.9Z" />
      <path d="m14.2 6.9 2.9 2.9" />
    </svg>
  );
}

export function PulseIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M2.8 12h4l2.4-5.8 3.8 11.6 2.4-5.8h5.8" />
    </svg>
  );
}

export function ReplyIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M20.5 11.6a8 8 0 0 1-11.3 7.3L4 20.4l1.5-4.3a8 8 0 1 1 15-4.5Z" />
      <path d="M8.6 11.6h.01M12 11.6h.01M15.4 11.6h.01" strokeWidth={2.6} />
    </svg>
  );
}

export function MonitorIcon(props: P) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4.5" width="18" height="11.8" rx="2.2" />
      <path d="M9.2 20.4h5.6M12 16.3v4.1" />
    </svg>
  );
}

export function ChartIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M4 4v15.2a.8.8 0 0 0 .8.8H20" />
      <path d="M8.6 15.6v-3.4M13 15.6V8.4M17.4 15.6V6.2" />
    </svg>
  );
}

export function WorkflowIcon(props: P) {
  return (
    <svg {...base(props)}>
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="18" cy="6" r="2.4" />
      <circle cx="12" cy="18" r="2.4" />
      <path d="M8.4 6h7.2M6.9 8.2l3.7 7.3M17.1 8.2l-3.7 7.3" />
    </svg>
  );
}

export function MailIcon(props: P) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="5.2" width="18" height="13.6" rx="2.4" />
      <path d="m4.5 7.5 7.5 5.4 7.5-5.4" />
    </svg>
  );
}

export function SearchIcon(props: P) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="6.8" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}
