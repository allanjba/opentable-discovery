# Project conventions

Restaurant search & discovery prototype for the Algolia Solutions Engineer assignment.
Prospect: OpenTable. Dataset: 5,000 US restaurants.

## Stack

- **Next.js 16.3.6** (App Router, `src/`) — see the generated block at the bottom
- React 19.2.8 · TypeScript · **Tailwind CSS 4** — configured in CSS via `@theme`,
  there is no `tailwind.config.js`
- Node 24 — runs `.mts` scripts natively, no build step: `node scripts/foo.mts`
- Dev server on port 3000

## Commit messages

Lowercase type prefix, colon, imperative summary:

```
feat: add cuisine facet to search sidebar
update: widen searchable attributes to include neighborhood
fix: correct semicolon delimiter in CSV parser
```

Types: `feat:` · `update:` · `fix:` · `docs:` · `chore:`

No AI co-author trailers or generated-by footers. Local git config identity only.

## Decision logging — two places, two depths

Every non-obvious decision is written down twice, **when it is made**:

1. **`NOTES.md`** (here) — one line, for quick reference while building
2. **`../solutions-hiring-assignment/private/decisions.MD`** — the full version: what
   was chosen, why, what was rejected, the trade-off. This is the study material for the
   technical debrief, where every choice gets challenged.

## Working rhythm

One step at a time. List what a step covers, get approval, implement, report. Do not
batch steps — the point is that every decision is understood and defensible, not that
the code exists.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
