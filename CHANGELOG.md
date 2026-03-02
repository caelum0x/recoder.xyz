# Changelog

All notable changes to Recoder.xyz will be documented in this file.

## [Unreleased] - 2026-02-24

### Added
- Real pricing page with 5 plan tiers (Free, Weekly, Monthly, Pro, Enterprise)
- Blog section with 3 initial posts
- Competitive comparison page (/alternatives)
- Enterprise landing page with SSO/SAML/compliance details
- API reference documentation with OpenAPI 3.0 spec (21 endpoints)
- Per-page SEO metadata for all platform and content pages
- Hreflang tags for 5 locales (en/tr/es/zh/de)
- Sitemap expanded from 9 to 99 entries with locale variants
- ProductSchema structured data for all 9 platform services
- Onboarding email automation (day 0/1/3/7 sequence)
- Churn prevention emails (payment failed, trial expiring, win-back, renewal reminder)
- Analytics event taxonomy with 22 typed events
- Upgrade prompts (banner, modal, usage warning, plan badge components)
- KPI admin dashboard with real-time metrics
- UTM parameter capture and referral tracking
- Newsletter subscriber dedicated table
- OpenAPI spec (public/openapi.json)
- HTTP security headers across all 4 Next.js apps

### Fixed
- Google Search Console verification placeholder replaced
- Auth rate limiting applied to 6 endpoints (login, signup, 2FA, password reset)
- Password reset session revocation using correct table name
- Dark mode CSS color conflicts (blue to orange brand)
- 50+ hardcoded CSS colors replaced with CSS variables
- Docker container naming (codecraft-* to recoder-*)
- Legacy NextAuth code cleaned up, migrated to Better Auth references
- 2FA routes migrated from raw SQL to typed Prisma operations
- Newsletter unsubscribe rewritten to use dedicated table

### Security
- CSP, HSTS, X-Frame-Options, X-Content-Type-Options added to all apps
- Rate limiting on auth endpoints (5/min login, 3/hr password reset)
- NEXTAUTH_SECRET to BETTER_AUTH_SECRET migration with fallback
