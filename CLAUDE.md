# DealFlow — Upwork Pipeline Command Center

## What This Is
Internal tool for managing an Upwork freelance pipeline. User manually copies job listings from Upwork saved searches, pastes them in, and the system handles: AI scoring/vetting, demo building (via Claude Code prompts), Loom script generation, proposal drafting, and pipeline tracking via a Kanban board.

## Tech Stack
- **Framework:** Next.js 16 (App Router, TypeScript, `src/` directory not used — app/ at root)
- **Styling:** Tailwind CSS v4 (CSS-based config via `@import "tailwindcss"` + `@theme inline`)
- **Database:** Supabase (PostgreSQL + JS client via `@supabase/supabase-js` and `@supabase/ssr`)
- **AI:** Anthropic Claude API (`@anthropic-ai/sdk`, model: `claude-sonnet-4-6`)
- **Validation:** Zod v4
- **Hosting:** Vercel (with `{ "fluid": true }` in vercel.json)
- **Font:** Geist Sans + Geist Mono (next/font/google)

## Design System
Dark theme only. Zinc-based palette inspired by Investor Magic:
- Backgrounds: `bg-zinc-950` (page), `bg-zinc-900 border border-zinc-800` (cards)
- Text: `text-white` (primary), `text-zinc-400` (secondary), `text-zinc-500` (muted)
- GO/Success: `text-emerald-400`, `bg-emerald-500/10`
- NO-GO/Error: `text-red-400`, `bg-red-500/10`  
- NEEDS_REVIEW/Warning: `text-amber-400`, `bg-amber-500/10`
- Info/In-progress: `text-blue-400`, `bg-blue-500/10`
- Interactive: `hover:bg-zinc-800`
- Borders: `border-zinc-800`
- Score colors: <2.5 red, 2.5-3.5 amber, >3.5 emerald

## Project Structure
```
dealflow/
├── app/
│   ├── globals.css
│   ├── layout.tsx              # Root layout (Geist font, dark bg)
│   ├── page.tsx                # Redirect to /login or /app
│   ├── login/page.tsx          # Password login
│   ├── app/
│   │   ├── layout.tsx          # Sidebar + main content shell
│   │   ├── page.tsx            # Dashboard (stats overview)
│   │   ├── daily-run/page.tsx  # Bulk paste + AI scoring workflow
│   │   ├── pipeline/page.tsx   # Kanban board
│   │   ├── saved-searches/page.tsx  # Manage saved search configs
│   │   └── components/         # Shared UI components
│   └── api/
│       ├── auth/route.ts
│       ├── jobs/route.ts
│       ├── jobs/[id]/route.ts
│       ├── jobs/parse/route.ts       # Bulk parse raw text
│       ├── jobs/deep-vet/route.ts    # Full job analysis
│       ├── saved-searches/route.ts
│       └── generate/
│           ├── claude-prompt/route.ts  # Generate Claude Code build prompt
│           ├── loom-script/route.ts
│           └── proposal/route.ts
├── lib/
│   ├── auth.ts                 # HMAC session (same pattern as Investor Magic)
│   ├── ai/claude.ts            # Claude API wrapper
│   ├── ai/parse-jobs.ts        # Bulk job text → structured data
│   ├── ai/score-job.ts         # Deep vet scoring
│   ├── ai/generate-script.ts   # Loom script generation
│   ├── ai/generate-proposal.ts # Proposal text generation
│   ├── schemas.ts              # All Zod schemas
│   └── supabase/
│       ├── client.ts           # Browser client
│       └── server.ts           # Server client (service role)
├── types/index.ts
├── middleware.ts                # Edge auth middleware
├── vercel.json                 # { "fluid": true }
├── CLAUDE.md                   # This file
└── package.json
```

## Key Commands
- `npm run dev` — Start dev server
- `npm run build` — Production build
- `npm run lint` — ESLint check

## Conventions
- All pages under `/app/*` are `'use client'` with useEffect data fetching (keep it simple)
- API routes are RESTful: GET/POST/PATCH/DELETE in route.ts files
- Use Zod for ALL API input validation and AI response parsing
- AI response parsing: strip markdown fences → find JSON → Zod validate → salvage individual items on failure
- Toast notifications via a useToast hook (no external dependency)
- Collapsible sidebar with localStorage persistence for collapsed state
- No external UI library — all components built with Tailwind

## Supabase
- Browser client uses `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Server client uses `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS)
- Tables use UUID primary keys with `gen_random_uuid()`
- All tables have `created_at TIMESTAMPTZ DEFAULT now()`
- Jobs table has `updated_at` with auto-update trigger

## Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
ADMIN_PASSWORD
AUTH_SECRET
```
