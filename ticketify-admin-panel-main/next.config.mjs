const isProduction = process.env.NODE_ENV === "production";

function origin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

const apiOrigin = origin(
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3333/api/v1",
);

const googleMaps = [
  "https://maps.googleapis.com",
  "https://maps.gstatic.com",
  "https://*.googleapis.com",
  "https://*.gstatic.com",
];

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js inlines its bootstrap scripts; dev mode additionally needs eval for HMR.
  `script-src 'self' 'unsafe-inline' ${isProduction ? "" : "'unsafe-eval'"} ${googleMaps.join(" ")}`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `img-src 'self' data: blob: https://medianet.mv ${googleMaps.join(" ")} ${apiOrigin}`,
  `font-src 'self' data: https://fonts.gstatic.com`,
  `connect-src 'self' ${apiOrigin} ${googleMaps.join(" ")} ${isProduction ? "" : "ws: http://127.0.0.1:* http://localhost:*"}`,
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.bml.com.mv",
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
]
  .map((directive) => directive.replace(/\s+/g, " ").trim())
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
