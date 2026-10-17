import type { NextConfig } from "next";

// cacheComponents apagado a propósito: todas las páginas son por-usuario (cookie + SQLite),
// el modelo dinámico clásico evita Suspense obligatorio alrededor de cookies().
const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Cuerpo y Comer se fundieron en Salud: los links viejos (PWA instalada, push) siguen andando.
  async redirects() {
    return [
      { source: "/cuerpo", destination: "/salud", permanent: false },
      { source: "/comer", destination: "/salud", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
