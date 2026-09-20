import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const CompassIcon = (props: IconProps) => (
  <IconBase {...props}><circle cx="12" cy="12" r="9" /><path d="m15.3 8.7-2 4.6-4.6 2 2-4.6 4.6-2Z" /></IconBase>
);
export const SparklesIcon = (props: IconProps) => (
  <IconBase {...props}><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z" /><path d="m18.5 14 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" /><path d="m5 13 .8 2.2L8 16l-2.2.8L5 19l-.8-2.2L2 16l2.2-.8L5 13Z" /></IconBase>
);
export const BookmarkIcon = (props: IconProps) => (
  <IconBase {...props}><path d="M6.5 4.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v17l-5.5-3.7-5.5 3.7v-17Z" /></IconBase>
);
export const SettingsIcon = (props: IconProps) => (
  <IconBase {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></IconBase>
);
export const SearchIcon = (props: IconProps) => (
  <IconBase {...props}><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></IconBase>
);
export const RefreshIcon = (props: IconProps) => (
  <IconBase {...props}><path d="M20 7v5h-5" /><path d="M19 12a7 7 0 1 0-1.8 4.7" /></IconBase>
);
export const ShieldIcon = (props: IconProps) => (
  <IconBase {...props}><path d="M12 22s8-3.8 8-10V5l-8-3-8 3v7c0 6.2 8 10 8 10Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></IconBase>
);
export const ExternalIcon = (props: IconProps) => (
  <IconBase {...props}><path d="M14 4h6v6" /><path d="m20 4-9 9" /><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" /></IconBase>
);
export const CloseIcon = (props: IconProps) => (
  <IconBase {...props}><path d="m6 6 12 12M18 6 6 18" /></IconBase>
);
export const CheckIcon = (props: IconProps) => (
  <IconBase {...props}><path d="m5 12 4 4L19 6" /></IconBase>
);
export const HeartIcon = (props: IconProps) => (
  <IconBase {...props}><path d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z" /></IconBase>
);
export const ThumbsDownIcon = (props: IconProps) => (
  <IconBase {...props}><path d="M10 15v4a2 2 0 0 0 2 2l3-7h4a2 2 0 0 0 2-2l-1-7a2 2 0 0 0-2-2H8v12h2Z" /><path d="M4 3h4v12H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /></IconBase>
);
export const FilmIcon = (props: IconProps) => (
  <IconBase {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4m10 0h4M3 15h4m10 0h4" /></IconBase>
);
export const ChevronIcon = (props: IconProps) => (
  <IconBase {...props}><path d="m9 18 6-6-6-6" /></IconBase>
);
export const DatabaseIcon = (props: IconProps) => (
  <IconBase {...props}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></IconBase>
);
export const GlobeIcon = (props: IconProps) => (
  <IconBase {...props}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14.5 14.5 0 0 1 0 18M12 3a14.5 14.5 0 0 0 0 18" /></IconBase>
);
export const PlusIcon = (props: IconProps) => (
  <IconBase {...props}><path d="M12 5v14M5 12h14" /></IconBase>
);
export const TrashIcon = (props: IconProps) => (
  <IconBase {...props}><path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6" /></IconBase>
);
