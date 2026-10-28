# Pokemon_FNAF_Nightmare_Zone
Pokémon × FNAF: Nightmare Zone is a browser-based horror mini-game inspired by Pokémon Mezastar. Players select Pokémon, battle Ghost-types and hostile animatronics, and survive nights in an abandoned pizzeria. Gameplay data powers four analytics types to explain results, uncover patterns, predict survival, and recommend strategies.

## Technology Stack

| Part | Framework / Technology |
| --- | --- |
| Frontend | Next.js + React |
| Backend | NestJS for local development; Next.js Route Handlers for Vercel |
| Database | Supabase (PostgreSQL) |
| 3D graphics | Three.js |
| Styling | CSS |

## Project structure

```text
frontend/                 Next.js App Router + React + CSS
  src/app/                Admin dashboard and responsive CSS
  src/components/         Interactive charts, icons, optional Three.js scene
  src/lib/dashboard.ts    Typed records, sample fixtures, analytics
  public/                 Bundled artwork, fonts, and attribution
backend/                  NestJS REST API
  src/supabase/           Supabase PostgreSQL client service
  src/gameplay/           Adapter for the game's existing Supabase records
  supabase/migrations/    Legacy alternate schema (not used by the game adapter)
```

## Local setup

Use Node.js 22.12+ (Node.js 24 recommended) and npm. Run commands from the repository root. On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm`.

```powershell
npm.cmd install
Copy-Item frontend/.env.local.example frontend/.env.local
Copy-Item backend/.env.example backend/.env
```

The configured local backend reads the neighboring game's server environment through `GAME_ENV_FILE=../../PokemonzApp/backend-gameplay/api/.env`, resolved from the `backend` working directory. No credentials are copied into the frontend. Alternatively, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` directly in the ignored `backend/.env`. Never put the service-role key in a `NEXT_PUBLIC_` variable.

Start the dashboard from the repository root:

```powershell
npm.cmd run dev
```

This starts the dashboard frontend at http://localhost:3003 and its NestJS backend at http://127.0.0.1:3002. The separate game API remains on port 3001; the dashboard uses port 3003 so it does not replace the game on port 3000. In PowerShell, `npm.cmd` avoids the script execution policy that can block `npm.ps1`.

To run the frontend and backend separately, use two terminals:

```powershell
npm.cmd run dev:frontend
```

```powershell
npm.cmd run dev:backend
```

Frontend: http://localhost:3003

Dashboard backend health: http://127.0.0.1:3002/api/health

Open **http://localhost:3003** for the dashboard UI. Port 3002 serves its backend API; its root URL redirects to the frontend configured by `FRONTEND_URL`.

## Deploy the dashboard to Vercel

The Next.js dashboard includes Vercel compatible API routes for login and reading the shared game database. Import the GitHub repository as a Vercel project and set **Root Directory** to `frontend`; use the detected Next.js framework and defaults for build and output settings. Vercel supports each monorepo app as a separate project, selected by its root directory.

Add these server-only variables in the Vercel project settings for Production (and Preview if needed):

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | The game project's Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | The existing server-side service role key; never use a `NEXT_PUBLIC_` prefix |
| `DASHBOARD_ACCESS_CODE` | The shared admin login code |
| `DASHBOARD_SESSION_SECRET` | A random secret at least 32 characters long |
| `GAME_API_URL` | Optional public URL for the game API, ending in `/api`; leave unset if the game API is only local |

Do not upload or commit either `.env` file. The `SUPABASE_PUBLISHABLE_KEY` is not needed by these hosted read-only dashboard routes. The signed login session expires after eight hours; logging out clears the browser session. Since Vercel cannot reach a game API running only on your PC, the live active-run count will show as unavailable unless `GAME_API_URL` points to a publicly reachable game API. Player and battle history still loads from Supabase.

Once Vercel gives the project a URL, visit it and sign in with `DASHBOARD_ACCESS_CODE`. To connect the existing GitHub repository, changes must be pushed to GitHub; then Vercel can build each commit automatically.

### Keep the backend running on Windows

To keep the backend available while you are signed into Windows, install the hidden current-user startup task:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/install-backend-startup.ps1
```

The supervisor checks the backend health endpoint, starts `backend/dist/main.js` if the service is down, and retries after a crash. Runtime output and supervisor events are written to ignored log files in `backend/`. Remove the startup task with `scripts/remove-backend-startup.ps1`. The task starts when your Windows account signs in; it does not run while the computer is off or the account is signed out.

The dashboard defaults to **Connected game** mode and loads actual records. Settings also offers a clearly marked sample workspace with five fictional trainers and 100 fictional battles; your mode preference is saved locally. Connection failures never silently substitute sample data. The health endpoint reports credential configuration; `GET /api/dashboard` verifies actual database reads.

## Admin dashboard

The Player Status screen includes Pokémon cards, search, night/session/HP-band filters, current roster summaries, four chart metrics, sortable player statistics, a paginated table, and player detail dialogs. Team Overview shows Pokémon type composition, member comparisons, team performance, night-by-night results, and opponent matchups. Both views use the same filtered records. Analytics Station summarizes player progress, animatronic encounters, recent session results, and historical performance. Settings switches between sample and actual records and controls dashboard refresh.

All battle statistics, recommendations, and correlations are derived from the selected records. In live mode, roster HP represents the **latest completed encounter**, independently of historical period filters. HP bands are displayed as dashboard labels: 0 HP at zero; Low HP at 40% or less; Mid HP above 40% through 60%; High HP above 60%; and No HP record when HP is missing. For example, 243/620 is Low HP and 278/620 is Mid HP. These bands are derived from saved HP snapshots and are not conditions persisted by the game. The game resets HP for each new night, so these are historical damage-review flags, not claims about a currently injured player. Level and current activity are not recorded and display as unavailable. Historical Wilson intervals are exploratory uncertainty estimates, not validated forecasts.

### Connect the separate game repository

The integration uses the existing `../PokemonzApp` game's `players`, `encounters`, `pokemon`, and related `turns` records. It does not require the old `nz_*` schema or an additional database migration.

1. Configure `backend/.env` using the existing game environment path or the same Supabase server credentials.
2. Set `NEXT_PUBLIC_API_URL=http://127.0.0.1:3002/api` in `frontend/.env` (or `.env.local`). Restart the frontend if needed. Set `FRONTEND_URL` on the backend to the frontend origin.
3. For local development, explicitly enable `DASHBOARD_LOCAL_MODE=true`. The backend binds to `127.0.0.1`, checks the actual socket address, and only permits requests without an Origin header or with the exact configured frontend Origin. Forwarded client-IP headers are not trusted.
4. Set `DASHBOARD_ACCESS_CODE` in `backend/.env` to the shared code admins will enter on the login page. Keep the value on the backend only. Successful sign-in creates an in-memory session that expires after 8 hours or when the backend restarts; Log out revokes it.
5. For production, set `NODE_ENV=production` and disable `DASHBOARD_LOCAL_MODE`. This makes the backend require a valid access-code session for dashboard data. In local development, the backend still permits loopback data requests from the configured frontend origin.

`GET /api/dashboard` returns `{ players, sessions, battles, metadata }` after enforcing local-development access or a valid access-code session. Service-role credentials remain on the server; this adapter only reads the game tables. It filters encounters to `data_source = real`, preserves registered players with no completed battles, groups chart sessions by game session + night, and includes the saved Pokémon roster. Simulated battles never mix with real gameplay. Missing or expired sessions return 401, and unavailable database records return 503. Refresh failures retain the last successful snapshot with an error message.

Keyset pagination avoids silently truncating tables at Supabase's usual row limit. Each table is capped at 20,000 records; larger datasets need server-side period aggregation. HP lost is summed from the actual per-turn `hp_before - hp_after` changes, which caps overkill at the remaining HP and still handles switches between teammates. This includes any recorded HP penalties. Missing historical turns produce unavailable HP-lost data, not an invented zero. Item consumption is not recorded, so item counts remain unavailable. The legacy alternate-schema endpoint is retained at `/api/dashboard/legacy` and is not used by this integration.

Completed game encounters appear after saving to Supabase and the next dashboard refresh (30 seconds by default). Ongoing runs are not exposed by the game's aggregate API as individual records, so current presence/ongoing HP cannot be inferred from it. No game write actions, account changes, or database migrations were performed.

Pokémon sample artwork and open-license fonts are bundled locally, with attribution/license files in `frontend/public`. New Pokémon IDs use external PokeAPI artwork with a text fallback. The optional Three.js component remains available; analytics charts use accessible SVG.

## Validation and production builds

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e --workspace frontend
npm.cmd run check:connection
```

After building, start each production app with `npm.cmd run start --workspace frontend` and `npm.cmd run start --workspace backend` in separate terminals.

Browser tests use installed Microsoft Edge, launch a temporary production server on port 3200, and use sample fixtures or mocked API responses. The separate `check:connection` command requires the dashboard frontend and backend to be running; it verifies the actual browser → NestJS → shared game database connection without creating records. Screenshots are saved under the ignored `frontend/test-results/` folder. Change the Playwright browser channel if Edge is unavailable.
