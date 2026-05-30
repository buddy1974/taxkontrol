import type { NextConfig } from 'next'
import path from 'path'

const securityHeaders = [
  // Force HTTPS for 2 years incl. subdomains
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Clickjacking protection
  { key: 'X-Frame-Options', value: 'DENY' },
  // Belt-and-suspenders clickjacking protection (CSP frame-ancestors only —
  // a full script CSP is intentionally omitted to avoid breaking Next.js inline runtime).
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  // Stop MIME-type sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Limit referrer leakage
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Lock down powerful browser features the app does not use
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  serverExternalPackages: ['@prisma/client', '.prisma/client'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
