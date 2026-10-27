import type { SVGProps } from "react";

export type IconName = "search" | "menu" | "bag" | "user" | "close" | "arrow" | "phone" | "chevron";

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {name === "search" ? (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </>
      ) : null}
      {name === "menu" ? (
        <>
          <path d="M3 7h18M3 16h18" />
        </>
      ) : null}
      {name === "bag" ? (
        <>
          <path d="M5 7h14l1 14H4L5 7Z" />
          <path d="M8 8V6a4 4 0 0 1 8 0v2" />
        </>
      ) : null}
      {name === "user" ? (
        <>
          <circle cx="12" cy="7.5" r="3.5" />
          <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
        </>
      ) : null}
      {name === "close" ? <path d="m6 6 12 12M6 18 18 6" /> : null}
      {name === "arrow" ? <path d="M19 12H5m6-6-6 6 6 6" /> : null}
      {name === "chevron" ? <path d="m8 4 8 8-8 8" /> : null}
      {name === "phone" ? (
        <path d="m8 3 3 5-3 3c2 3 3 4 6 5l3-3 4 3c0 3-2 5-4 5C10 21 3 14 3 7c0-2 2-4 5-4Z" />
      ) : null}
    </svg>
  );
}
