import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Required when opening `next dev` through Cloudflare/ngrok tunnels.
  // Without this, Mini App JS/CSS requests get "Unauthorized" and React never starts.
  allowedDevOrigins: [
    "*.trycloudflare.com",
    "*.ngrok-free.app",
    "*.ngrok.app",
  ],
  turbopack: {
    root,
  },
  serverExternalPackages: ["grammy", "postgres"],
};

export default nextConfig;
