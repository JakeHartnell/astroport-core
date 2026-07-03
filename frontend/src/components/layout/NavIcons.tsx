/* Single-stroke, currentColor icons in the Lucide idiom used by the Juno
   design system. Kept local as inline SVG so the shell has no icon-font or
   third-party dependency. 1.5px stroke, 18px default box. */
import type { ReactElement, ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 18, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function SwapIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 8h13M14 5l3 3-3 3" />
      <path d="M20 16H7M10 13l-3 3 3 3" />
    </Base>
  );
}

export function PoolsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="8" cy="8" r="4.5" />
      <circle cx="16" cy="16" r="4.5" />
    </Base>
  );
}

export function StatsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 16v-4M13 16V8M18 16v-6" />
    </Base>
  );
}

export function PortfolioIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3.5" y="6" width="17" height="13" rx="1.5" />
      <path d="M3.5 10h17M8 6V4.5h8V6" />
    </Base>
  );
}

export function CreateIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v8M8 12h8" />
    </Base>
  );
}

export const navIconByRoute: Record<string, (props: IconProps) => ReactElement> = {
  "/swap": SwapIcon,
  "/pools": PoolsIcon,
  "/stats": StatsIcon,
  "/portfolio": PortfolioIcon,
  "/create": CreateIcon,
};
