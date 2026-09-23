// Brix Chat — original SVG icon set for the dashboard (stroke style, 24px grid).

import type { ReactNode } from 'react';
import { cx } from '../../lib/utils';

export function Icon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx('w-5 h-5 shrink-0', className)}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const ChatIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-5 4v-14.5z" />
    <path d="M8.5 9.5h7M8.5 12.5h4.5" />
  </Icon>
);

export const UsersIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
    <circle cx="16.8" cy="9" r="2.4" />
    <path d="M16.5 14.7c2.2.3 3.7 1.9 4.1 4.3" />
  </Icon>
);

export const MegaphoneIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M4 10.5v3l3.5.8 1.8 4.7h2.1l-1.6-4.2 8.2 1.7V6.9L9.8 9.4 4 10.5z" />
    <path d="M18 6.9V4.5M7.5 11.3V19" />
  </Icon>
);

export const TicketIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5h13A1.5 1.5 0 0 1 20 8.5v1.2a2.3 2.3 0 0 0 0 4.6v1.2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 15.5v-1.2a2.3 2.3 0 0 0 0-4.6V8.5z" />
    <path d="M13.5 7v1.8M13.5 11v2M13.5 15.2V17" strokeDasharray="1.5 2" />
  </Icon>
);

export const BookIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H18v15.5H6.7A1.7 1.7 0 0 0 5 20.2V4.5z" />
    <path d="M5 18.5h13" />
    <path d="M9 7.5h6" />
  </Icon>
);

export const BoltIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12l1-8z" />
  </Icon>
);

export const ChartIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M4 20h16" />
    <path d="M7 16v-5M12 16V7M17 16v-8" />
  </Icon>
);

export const StarIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 9.7l5.9-.8L12 3.5z" />
  </Icon>
);

export const ContactsIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
    <circle cx="9" cy="11" r="1.8" />
    <path d="M6.2 15.5c.5-1.6 1.6-2.4 2.8-2.4s2.3.8 2.8 2.4" />
    <path d="M14.5 9.5H18M14.5 12.5H18M14.5 15.5h3" />
  </Icon>
);

export const TriggerIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </Icon>
);

export const CogIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3.5v2.4M12 18.1v2.4M3.5 12h2.4M18.1 12h2.4M6 6l1.7 1.7M16.3 16.3 18 18M18 6l-1.7 1.7M7.7 16.3 6 18" />
  </Icon>
);

export const ShieldIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M12 3 5 5.8v5.4c0 4.4 2.9 7.6 7 9.3 4.1-1.7 7-4.9 7-9.3V5.8L12 3z" />
    <path d="m9.5 11.8 1.8 1.8 3.2-3.4" />
  </Icon>
);

export const BellIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M6 9.5a6 6 0 0 1 12 0c0 4.5 1.8 5.7 1.8 5.7H4.2S6 14 6 9.5" />
    <path d="M10 19a2.2 2.2 0 0 0 4 0" />
  </Icon>
);

export const SearchIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Icon>
);

export const CommandIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M9 9V7.2A1.7 1.7 0 0 1 10.7 5.5h1.1a1.7 1.7 0 0 1 1.7 1.7V9m0 6v1.8a1.7 1.7 0 0 1-1.7 1.7h-1.1a1.7 1.7 0 0 1-1.7-1.7V15m-3.5-6h1.8a1.7 1.7 0 0 1 1.7 1.7v1.1a1.7 1.7 0 0 1-1.7 1.7H5.5m13 0h-1.8a1.7 1.7 0 0 1-1.7-1.7v-1.1a1.7 1.7 0 0 1 1.7-1.7h1.8" />
  </Icon>
);

export const ChevronDownIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="m6 9.5 6 6 6-6" />
  </Icon>
);

export const ChevronLeftIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M14.5 6 8.5 12l6 6" />
  </Icon>
);

export const ChevronRightIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="m9.5 6 6 6-6 6" />
  </Icon>
);

export const PlusIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const XIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Icon>
);

export const CheckIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Icon>
);

export const ClockIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

export const FlagIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M6 20.5v-16M6 5.5h11l-2.5 3.5L17 12.5H6" />
  </Icon>
);

export const MenuIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

export const ArrowLeftIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M19 12H5m6-6-6 6 6 6" />
  </Icon>
);

export const SparkleIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M12 3.5c.7 4.2 2.6 6.6 7 7.5-4.4.9-6.3 3.3-7 7.5-.7-4.2-2.6-6.6-7-7.5 4.4-.9 6.3-3.3 7-7.5z" />
    <path d="M18.5 3.5c.3 1.8 1.1 2.9 3 3.2-1.9.4-2.7 1.4-3 3.2-.3-1.8-1.1-2.8-3-3.2 1.9-.3 2.7-1.4 3-3.2z" />
  </Icon>
);

export const LogoutIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M14 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H14" />
    <path d="m10.5 12 6.5-.5M14.5 8.5l3.5 3.5-3.5 3.5" />
  </Icon>
);

export const GlobeIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <circle cx="12" cy="12" r="8" />
    <path d="M4 12h16M12 4c2.8 2.6 4.2 5 4.2 8S14.8 17.4 12 20c-2.8-2.6-4.2-5-4.2-8S9.2 6.6 12 4z" />
  </Icon>
);

export const PaletteIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M12 4.5a7.5 7.5 0 0 0-7.5 7.5c0 2 1.2 3 2.8 3h2.2a1.5 1.5 0 0 1 1.5 1.5v.2a2.3 2.3 0 0 0 4.6 0c2.8-.5 4.9-2.9 4.9-5.9A7.5 7.5 0 0 0 12 4.5z" />
    <circle cx="8.5" cy="10.5" r="1" fill="currentColor" />
    <circle cx="12.5" cy="8.5" r="1" fill="currentColor" />
    <circle cx="15.5" cy="11" r="1" fill="currentColor" />
  </Icon>
);

export const CodeIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="m9 9-3.5 3L9 15M15 9l3.5 3L15 15M13.5 5.5l-3 13" />
  </Icon>
);

export const TeamIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <circle cx="9" cy="8.5" r="3" />
    <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    <circle cx="16.5" cy="9.5" r="2.4" />
    <path d="M15.8 14.7c2.6.3 4.7 2.1 4.7 4.8" />
  </Icon>
);

export const BuildingIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M5 20V6.5A1.5 1.5 0 0 1 6.5 5h7A1.5 1.5 0 0 1 15 6.5V20" />
    <path d="M15 9.5h3.5A1.5 1.5 0 0 1 20 11v9" />
    <path d="M3.5 20h17" />
    <path d="M8.5 8.5h3M8.5 12h3M8.5 15.5h3" />
  </Icon>
);

export const TagIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="m4 4.5 8-1 11 11-7 7-11-11-1-6z" />
    <circle cx="9" cy="9.5" r="1.3" />
  </Icon>
);

export const TerminalIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13z" />
    <path d="m8.5 9.5 2.5 2.5-2.5 2.5M13 14.5h3.5" />
  </Icon>
);

export const HeartIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M12 19.5S4.5 14.5 4.5 9.7A4.2 4.2 0 0 1 8.7 5.5c1.5 0 2.7.8 3.3 1.9a4.2 4.2 0 0 1 3.3-1.9 4.2 4.2 0 0 1 4.2 4.2c0 4.8-7.5 9.8-7.5 9.8z" />
  </Icon>
);
