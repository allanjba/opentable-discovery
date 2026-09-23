# Build notes

One line per decision. Full reasoning lives in
`../solutions-hiring-assignment/private/decisions.MD`.

## Setup

- Separate repo from the assignment repo — their README says not to fork it.
- Public repo, so the link can be shared at submission without collaborator admin.
- Next.js 16 + TypeScript + Tailwind 4. Tailwind 4 configures in CSS via `@theme`; no config file.
- Dev server on port 3000 (freed by stopping the `shadcn_glimmer` Puma server).
- Scripts will be `.mts`, run natively by Node 24 — no build step for tooling.

## Links

- Repo: https://github.com/allanjba/opentable-discovery (public)
- Live: https://opentable-discovery.vercel.app
- Vercel project `opentable-discovery` imported from GitHub, so every push to `main` auto-deploys.

## Data

_(nothing yet)_

## Search

_(nothing yet)_

## Look and feel

_(nothing yet)_
