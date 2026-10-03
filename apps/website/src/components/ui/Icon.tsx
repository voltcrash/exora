import type { ReactNode } from "react";
import styles from "./ui.module.css";

/*
 * One stroke weight, one grid: every icon is drawn on 20×20 at a 1.6 stroke so they sit on a line
 * of text at any size without one reading heavier than its neighbour.
 */
const PATHS = {
  atlas: (
    <>
      <path d="M3.5 3.5v13h13" />
      <circle cx="7.5" cy="12" r="1" />
      <circle cx="10" cy="8.5" r="1" />
      <circle cx="13" cy="10.5" r="1" />
      <circle cx="15" cy="5.5" r="1" />
    </>
  ),
  "arrow-left": <path d="M16 10H4m5-5-5 5 5 5" />,
  "arrow-right": <path d="M4 10h12m-5-5 5 5-5 5" />,
  "arrow-up-right": <path d="M6 14 14 6M7.5 6H14v6.5" />,
  "black-hole": (
    <>
      <circle cx="10" cy="10" r="3" />
      <ellipse cx="10" cy="10" rx="8" ry="3.6" transform="rotate(-16 10 10)" />
    </>
  ),
  check: <path d="m4.5 10.5 3.5 3.5 7.5-8" />,
  "chevron-down": <path d="m5.5 8 4.5 4.5L14.5 8" />,
  "chevron-left": <path d="M12 5.5 7.5 10l4.5 4.5" />,
  "chevron-right": <path d="m8 5.5 4.5 4.5L8 14.5" />,
  "chevron-up": <path d="m5.5 12 4.5-4.5 4.5 4.5" />,
  close: <path d="m5.5 5.5 9 9m0-9-9 9" />,
  compass: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="m12.8 7.2-1.6 4-4 1.6 1.6-4z" />
    </>
  ),
  cube: <path d="M10 3 16.5 6.7v6.6L10 17l-6.5-3.7V6.7zM3.5 6.7 10 10.4l6.5-3.7M10 10.4V17" />,
  dice: (
    <>
      <rect x="3.5" y="3.5" width="13" height="13" rx="3" />
      <circle cx="7.3" cy="7.3" r=".6" />
      <circle cx="12.7" cy="12.7" r=".6" />
      <circle cx="10" cy="10" r=".6" />
    </>
  ),
  external: (
    <path d="M11 3.5h5.5V9M16.5 3.5 9 11M8 5H5a1.5 1.5 0 0 0-1.5 1.5v8.5A1.5 1.5 0 0 0 5 16.5h8.5A1.5 1.5 0 0 0 15 15v-3" />
  ),
  eye: (
    <>
      <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" />
      <circle cx="10" cy="10" r="2.4" />
    </>
  ),
  "eye-off": (
    <>
      <path d="M8 4.8c.6-.2 1.3-.3 2-.3 5 0 8 5.5 8 5.5a14 14 0 0 1-2.2 2.9M5.6 6C3.3 7.5 2 10 2 10s3 5.5 8 5.5c1.6 0 3-.5 4.1-1.3" />
      <path d="m3 3 14 14M8.3 8.4a2.4 2.4 0 0 0 3.3 3.3" />
    </>
  ),
  forge: (
    <>
      <path d="M10 2.5v3M10 14.5v3M2.5 10h3M14.5 10h3M4.7 4.7l2.1 2.1M13.2 13.2l2.1 2.1M15.3 4.7l-2.1 2.1M6.8 13.2l-2.1 2.1" />
      <circle cx="10" cy="10" r="2" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="5" height="5" rx="1.2" />
      <rect x="11.5" y="3.5" width="5" height="5" rx="1.2" />
      <rect x="3.5" y="11.5" width="5" height="5" rx="1.2" />
      <rect x="11.5" y="11.5" width="5" height="5" rx="1.2" />
    </>
  ),
  home: <path d="M3.5 9 10 3.5 16.5 9v7a.5.5 0 0 1-.5.5h-3.5v-5h-5v5H4a.5.5 0 0 1-.5-.5z" />,
  info: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 9v4.5M10 6.5v.01" />
    </>
  ),
  list: <path d="M7 5.5h9.5M7 10h9.5M7 14.5h9.5M3.5 5.5h.01M3.5 10h.01M3.5 14.5h.01" />,
  moon: <path d="M15.5 12.3A6.5 6.5 0 0 1 7.7 4.5a6.5 6.5 0 1 0 7.8 7.8Z" />,
  music: (
    <>
      <path d="M7.5 15V5l9-1.5v10" />
      <circle cx="5.5" cy="15" r="2" />
      <circle cx="14.5" cy="13.5" r="2" />
    </>
  ),
  "music-off": (
    <>
      <path d="M7.5 11V5l9-1.5v8M3 3l14 14" />
      <circle cx="5.5" cy="15" r="2" />
    </>
  ),
  orbit: (
    <>
      <circle cx="10" cy="10" r="2.2" />
      <circle cx="10" cy="10" r="7" />
      <circle cx="15" cy="5.1" r="1.3" />
    </>
  ),
  pause: <path d="M7 4.5v11M13 4.5v11" />,
  planet: (
    <>
      <circle cx="10" cy="10" r="5.2" />
      <path d="M4.1 11.9C1.9 13.7 1.3 15.2 2 15.9c1.1 1.1 5.3-1.2 9.3-5.2s6.3-8.2 5.2-9.3c-.7-.7-2.2-.1-4 2.1" />
    </>
  ),
  play: <path d="M6.5 4.5v11l9-5.5z" />,
  plus: <path d="M10 4v12M4 10h12" />,
  refresh: <path d="M16 10a6 6 0 1 1-1.8-4.3M16 3.5v3.5h-3.5" />,
  reverse: <path d="M13.5 4.5v11l-9-5.5z" />,
  route: (
    <>
      <circle cx="5" cy="15" r="1.8" />
      <circle cx="15" cy="5" r="1.8" />
      <path d="M6.8 15H13a2.5 2.5 0 0 0 0-5H7a2.5 2.5 0 0 1 0-5h6.2" />
    </>
  ),
  search: (
    <>
      <circle cx="9" cy="9" r="5.5" />
      <path d="m13 13 3.5 3.5" />
    </>
  ),
  share: (
    <>
      <path d="M10 12.5V3m-3.5 3.5L10 3l3.5 3.5" />
      <path d="M6.5 9H5a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 5 17h10a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 15 9h-1.5" />
    </>
  ),
  sliders: <path d="M4 5.5h7m3 0h2M4 10h2m3 0h7M4 14.5h8m3 0h1M11 4v3M6 8.5v3M12 13v3" />,
  sparkle: (
    <path d="M10 2.5c.6 3.9 3.6 6.9 7.5 7.5-3.9.6-6.9 3.6-7.5 7.5-.6-3.9-3.6-6.9-7.5-7.5 3.9-.6 6.9-3.6 7.5-7.5Z" />
  ),
  star: (
    <>
      <circle cx="10" cy="10" r="3.4" />
      <path d="M10 2v2.2M10 15.8V18M2 10h2.2M15.8 10H18M4.3 4.3l1.6 1.6M14.1 14.1l1.6 1.6M15.7 4.3l-1.6 1.6M5.9 14.1l-1.6 1.6" />
    </>
  ),
  "wifi-off": (
    <path d="M3 3l14 14M10 15.5v.01M7.5 13a3.6 3.6 0 0 1 4.3-.5M5 10.4a7.3 7.3 0 0 1 3-1.7M12.7 8.9A7.3 7.3 0 0 1 15 10.4M2.5 7.7A11 11 0 0 1 6 5.6M10.7 5.1a11 11 0 0 1 6.8 2.6" />
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

interface IconProps {
  className?: string;
  name: IconName;
  size?: number;
}

export const Icon = ({ className, name, size = 18 }: IconProps) => (
  <svg
    className={className ? `${styles["icon"]} ${className}` : styles["icon"]}
    data-icon={name}
    width={size}
    height={size}
    viewBox="0 0 20 20"
    aria-hidden="true"
    focusable="false"
  >
    {PATHS[name]}
  </svg>
);
