/**
 * Shared inline-SVG icon set (Lucide-style, 24×24 viewBox, stroke-based).
 * Replaces emoji icons across the Streamlined Workspace UI — no npm dependency.
 */

export type IconName =
  | 'logo' | 'library' | 'workspace' | 'manuscript' | 'exports'
  | 'statistics' | 'settings' | 'search' | 'send' | 'check'
  | 'chevronDown' | 'chevronRight' | 'chevronUp' | 'plus' | 'bulb'
  | 'play' | 'eye' | 'pencil' | 'download' | 'x' | 'history' | 'sparkles' | 'mail';

const ICON_PATHS: Record<IconName, React.ReactElement> = {
  logo: (
    <>
      <path d="M20 4 8.5 15.5M20 4c-1 5-2.5 9.5-6 13-2.2 2.2-5.5 3-8 3 0-2.5.8-5.8 3-8C12.5 8.5 15 6 20 4Z" />
      <path d="M6 20c.5-2 1.5-3.5 3-4.5" />
    </>
  ),
  library: (
    <>
      <path d="M4 4v16M9 4v16M14 5l4.5 15" />
      <path d="M4 4h5M4 20h5" />
    </>
  ),
  workspace: (
    <>
      <path d="m12 19 7-7 3 3-7 7-3-3z" />
      <path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
      <path d="m2 2 7.586 7.586" />
      <circle cx="11" cy="11" r="2" />
    </>
  ),
  manuscript: (
    <path d="M2 4c3-1.5 5.5-1.5 8 0v16c-2.5-1.5-5-1.5-8 0V4ZM22 4c-3-1.5-5.5-1.5-8 0v16c2.5-1.5 5-1.5 8 0V4Z" />
  ),
  exports: (
    <path d="m7.5 4.27 9 5.15M21 8l-9-5-9 5v8l9 5 9-5V8ZM3.3 7l8.7 5 8.7-5M12 22V12" />
  ),
  statistics: (
    <>
      <path d="M3 3v18h18" />
      <path d="M7 15v3M12 10v8M17 6v12" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  send: (
    <>
      <path d="m22 2-7 20-4-9-9-4 20-7Z" />
      <path d="M22 2 11 13" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  chevronUp: <path d="m18 15-6-6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  bulb: (
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.7.5 1.2 1.3 1.4 2.1h4.2c.2-.8.7-1.6 1.4-2.1A6 6 0 0 0 12 3Z" />
  ),
  play: <path d="M6 4.5v15l13-7.5-13-7.5Z" fill="currentColor" stroke="none" />,
  eye: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  pencil: (
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" />
  ),
  download: <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </>
  ),
  sparkles: (
    <>
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0Z" />
      <path d="M20 3v4M22 5h-4" />
    </>
  ),
  mail: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </>
  ),
};

type IconProps = {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
};

export function Icon({ name, size = 19, strokeWidth = 1.5, className }: IconProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}
