/**
 * One consistent stroke-based icon set, hand-tuned to the line weight
 * the rest of the UI uses (1.5px). Stroke color is inherited from
 * `currentColor`. We deliberately keep the count small.
 */

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number, rest: SVGProps<SVGSVGElement>) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...rest,
});

export function ArrowLeft({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <path d="M15 19l-7-7 7-7" />
    </svg>
  );
}

export function ArrowRight({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function Camera({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <rect x="3" y="6.5" width="14" height="11" rx="2" />
      <path d="M17 10l4-2v8l-4-2" />
      <circle cx="9" cy="12" r="2.4" />
    </svg>
  );
}

export function Mic({ size = 18, on = true, ...rest }: IconProps & { on?: boolean }) {
  return (
    <svg {...base(size, rest)}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      {!on && <path d="M3 3l18 18" />}
    </svg>
  );
}

export function MicOff({ size = 18, ...rest }: IconProps) {
  return <Mic on={false} size={size} {...rest} />;
}

export function Vs({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <path d="M5 5l5 14" />
      <path d="M19 5l-5 14" />
      <path d="M9 9h6" />
    </svg>
  );
}

export function Target({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3" />
      <path d="M12 19v3" />
      <path d="M2 12h3" />
      <path d="M19 12h3" />
    </svg>
  );
}

export function Timer({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 1.5" />
      <path d="M9 2h6" />
      <path d="M12 2v3" />
    </svg>
  );
}

export function Trophy({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
      <path d="M7 6H4a2 2 0 0 0 2 4" />
      <path d="M17 6h3a2 2 0 0 1-2 4" />
      <path d="M9 19h6" />
      <path d="M12 14v5" />
    </svg>
  );
}

export function Sparkle({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
    </svg>
  );
}

export function History({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function Globe({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18" />
      <path d="M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

export function Check({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <path d="M4 12l5 5 11-12" />
    </svg>
  );
}

export function X({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

export function Refresh({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

export function Crown({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <path d="M3 8l4 5 5-7 5 7 4-5-2 11H5L3 8z" />
    </svg>
  );
}

export function Trash({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <path d="M4 7h16" />
      <path d="M10 4h4l1 3H9z" />
      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function Play({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <path d="M7 5l12 7-12 7V5z" />
    </svg>
  );
}
