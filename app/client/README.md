# Cancer Registry — Front End (`app/client/`)

React 18 + TypeScript + Vite + Tailwind + shadcn-style UI. Builds against a
**mock** of `contracts/api_contract.md`, so it runs standalone with no backend.

## Run locally

```bash
cd app/client
npm install
npm run dev          # http://localhost:5173  (mock API, no backend needed)
```

To run against the real backend locally, start the FastAPI server (from
`app/server`, `uvicorn main:app --reload --port 8000`) and run the client with
`VITE_USE_MOCK=false npm run dev` (Vite proxies `/api` -> `http://localhost:8000`).

Other scripts:

```bash
npm run build        # tsc -b && vite build  -> ../server/static  (FastAPI serves this in prod)
npm run typecheck    # tsc -b --noEmit
npm run preview      # preview the production build
```

## Build output (how the client reaches production)

`npm run build` writes directly into **`app/server/static`** (see
`vite.config.ts` `outDir: '../server/static'`). The FastAPI server
(`app/server/main.py`) serves that directory as the SPA, so there is no separate
copy step. The prebuilt `app/server/static` is committed to the repo so the app
deploys without a Node build step on the server; rerun `npm ci && npm run build`
whenever the client changes to refresh it.

## Mock vs real backend

The API client is swappable (`src/api/client.ts`):

| Mode | How | Behavior |
|---|---|---|
| Mock (default) | unset, or `VITE_USE_MOCK=true` | in-memory fixtures in `src/api/mock/` |
| Real backend | `VITE_USE_MOCK=false` | `fetch` to `/api/*` (Vite proxies to `VITE_API_TARGET`, default `http://localhost:8000`) |

Nothing in the UI references a specific implementation — both satisfy the
`ApiClient` interface in `src/api/types.ts`.

## Branding (config-driven, no hardcoded workspace values)

`VITE_BRAND_NAME`, `VITE_BRAND_SUBTITLE`, `VITE_BRAND_PRODUCT` (see `src/lib/branding.ts`).

## Screens

- `/` — Triage **Queue** (TanStack Table, filters, expandable rationale, triage actions)
- `/drafts` — **My Drafts** overview
- `/cases/:caseId` — **Form Review** (data-driven NAACCR sections, inline edit, auto-save, edits panel, Finish gate)

## Data-driven

The form renders whatever `GET /api/cases/{id}` returns — N sections × M fields.
Swapping the mock dictionary (`src/api/mock/dictionary.ts`) for the full NAACCR
300+ item set requires **no component changes**.
