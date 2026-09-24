#Notes

## Plan

- [x] Bootstrap and deploy to git and vercel
- [x] Static components to test project styles
- [x] Create script to merge data files
- [ ] Algolia account and index data
- [ ] Algolia search component
- [ ] Adjust data script to clean the data and reindex
- [ ] Improve search experience

## Setup

- Separate public
- Next.js 16 + TypeScript + Tailwind 4. Tailwind 4 configures in CSS via `@theme`; no config file.
- Scripts will be `.mts`, run natively by Node 24 — no build step for tooling.

## Links

- Repo: https://github.com/allanjba/opentable-discovery (public)
- Live: https://opentable-discovery.vercel.app
- CICD to Vercel project `opentable-discovery` imported from GitHub, so every push to `main` auto-deploys.

## Data

- Source files copied to `data/source/` untouched; no transformations yet.
- `npm run data:build` merges them into `public/data/restaurants.json`. Run manually, output is committed — no build-time generation.
- Output is a faithful superset: the source JSON record unchanged, plus 7 CSV fields. Verified across all 5,000 — zero drift.
- `objectID` stays a number, as the source has it. If Algolia needs a string, that belongs in the indexer, not the merge.
- Types are converted once, at the CSV boundary. CSV is typeless so numbers are parsed on read; fields that already had a type in the JSON are passed through untouched.
- The join reports failures in both directions — JSON record with no CSV row, and CSV row nobody claimed. The second is the silent one.
- Known: parser counts a phantom row from the file's trailing newline, so it reports 5001 rows and 1 orphan. Output is unaffected (5,000 records, no corruption); fix is `text.trim().split()`.
- Two of the three restaurants shown in their mockup ("Anchor and Hope", "Bluestem Brasserie") are not in our dataset — the screenshot was built from a different cut.

## Search

_(nothing yet)_

## Look and feel

- Kept their visual identity — palette, Open Sans, background tile — rather than restyling, so that when the demo sits next to their screenshot every visible difference is behaviour, not decoration.
- Their `index.css` was not reused as code (float-based, 15 float rules to 1 flex). Mined for colour and type tokens only.
- Tokens live in `globals.css` as Tailwind 4 `@theme` variables.
- Static page uses six real records from `data/source/`, not invented ones, so the layout is tested against real field lengths and diacritics.
- Left out their Rating star-picker and Payment Options facet — both are on the list to replace rather than reproduce.
