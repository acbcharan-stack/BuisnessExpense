"use client";

import { useLinkStatus } from "next/link";

/** Child of a `<Link>`: dims/pulses the link while its navigation is in flight. */
export function LinkPending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`ml-1 inline-block size-1.5 rounded-full bg-current transition-opacity ${
        pending ? "animate-pulse opacity-80" : "opacity-0"
      }`}
    />
  );
}
