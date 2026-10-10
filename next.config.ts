import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Server actions default to a 1 MB body, which silently rejects phone-camera
    // logos/signatures. Images are also shrunk client-side before upload.
    serverActions: { bodySizeLimit: "4mb" },
    /**
     * Keep prefetched page data in the client-side Router Cache for a short
     * while so moving between the business tabs (and Prev/Next paging) reuses
     * what was already fetched instead of hitting the server every click.
     *
     * Metaphor: instead of walking back to the store every time you want to
     * re-check a shelf, you keep the last few pages you looked at on your desk
     * for a couple of minutes. `dynamic` (non-prefetched views) is deliberately
     * short — 2 min — so live data on pages like the Inbox is never far behind.
     */
    staleTimes: {
      dynamic: 120,
      static: 180,
    },
  },
};

export default nextConfig;
