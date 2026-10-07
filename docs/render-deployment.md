# Deploy Doctor Dev as one Render web service

The Express server serves `frontend/dist` and `/api` together. The frontend uses
relative `/api` requests by default, including in development through Vite's proxy.
The legacy `VITE_API_URL` override is retained so the old Static Site continues
to work until migration; remove that variable on the combined Web Service. There is
no separate production frontend service and no keep-alive job. The whole web
service can sleep when idle; visitors then wait for Render to wake it before the
homepage loads.

## Service settings

Deploy branch `main` of `priyanshusharan-cmd/doctor-dev` as a **Web Service**, with:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Root directory | Leave blank (repository root) |
| Build command | `npm ci --include=dev && npm ci --include=dev --prefix backend && npm ci --include=dev --prefix frontend && npm run build` |
| Start command | `npm start` |
| Instance type | Free |
| Health check path | `/api/health` |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `22` |

`render.yaml` provides these settings for a new Blueprint. Adding that file alone
does not change existing manually configured services. Let Render provide `PORT`.
Remove `VITE_API_URL` on the combined service so API requests use the site's own origin.
`FRONTEND_URL` is only relevant if intentionally allowing cross-origin clients.

## Migrate the existing deployment

1. Update the existing `doctor-dev-backend` **Web Service** with the settings
   above, remove its `VITE_API_URL` variable if present, then manually deploy the
   latest commit. Keep the old static frontend's existing `VITE_API_URL` until
   cutover so it can continue calling the backend.
2. Verify that its root URL now serves the dashboard, `/api/health` returns JSON
   with version `1.0.0`, and Try Demo completes.
3. The target public URL is `https://doctor-dev.onrender.com`. The current
   `doctor-dev` Static Site cannot be changed into a Node Web Service in place.
   Render also assigns the `onrender.com` hostname separately from the display
   name: do not assume renaming a service transfers the existing hostname.
4. To preserve the exact hostname, check Render's dashboard/support for a hostname
   transfer or reuse from the Static Site to the combined Web Service. If Render
   requires recreation, have the verified combined service and its settings ready
   before removing the old site. Render may assign a suffixed hostname rather than
   reissue the original; confirm availability before relying on deletion/recreation.
   A custom domain can instead be pointed at the combined Web Service.
5. After the final URL serves both dashboard and API, retire the old Static Site.
   If a new combined Web Service was created instead of reusing the backend,
   retire the old backend as well so only one web service consumes instance hours.

GitHub's `v1.0.0` source release can point to this combined-service code while the
live Render service still uses its old configuration. Updating the release tag
alone does not change Render's root directory or build/start commands.

## Local production check

From the repository root, run `npm run build`, then
`NODE_ENV=production npm start`. Open `http://localhost:3001` and use Try Demo.
For development, `npm run dev` still runs Vite and the API separately with the
same-origin `/api` proxy. Production startup fails clearly if the frontend build
is missing.
