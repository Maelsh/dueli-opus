# Getting Started - البدء

This guide will help you set up Dueli for development and deployment.

## Prerequisites / المتطلبات

- **Node.js** 18+ - [Download](https://nodejs.org/)
- **npm** or **yarn**
- **Git**
- **Cloudflare Account** - Required for D1 database and Workers.

## Installation / التثبيت

### 1. Clone & Install
```bash
git clone https://github.com/Maelsh/dueli-opus.git
cd dueli-opus/webapp
npm install
```

### 2. Environment Setup
Copy the template and configure your secrets.
```bash
cp .dev.vars.example .dev.vars
```
> **Note**: `.dev.vars` is for local development secrets. For production, use `wrangler secret put`.

## Development / التطوير

### Quick Start
To start the full stack environment (Client Builder + CSS + Server + Database):
```bash
npm run dev:sandbox
```
Runs at `http://0.0.0.0:3000`.

### NPM Scripts Reference
We have organized scripts for every part of the stack:

| Script | Purpose |
|--------|---------|
| `dev` | Basic Vite dev server (frontend focus). |
| `dev:sandbox` | **Main Dev Mode**: Runs Wrangler Pages with local D1 database. |
| `build` | Full build (CSS + Client + Server). |
| `build:client` | Compiles TypeScript frontend to `dist/static/app.js` using esbuild. |
| `build:css` | Compiles TailwindCSS to `public/static/styles.css`. |
| `db:migrate:local`| Applies D1 migrations to local sandbox db. |
| `db:seed` | Seeds the local database with `seed.sql`. |
| `db:reset` | Nukes local DB state and re-runs migrations + seed. |
| `deploy` | Deploys the `dist` folder to Cloudflare Pages. |

## Database Management

### Local
The local database handles persistence in `.wrangler/state`.
- **Resetting Data**: If you mess up data, just run:
  ```bash
  npm run db:reset
  ```
  This is a powerful script that cleans `v3/d1` state and re-seeds ~150KB of test data.

### Production
1. **Create DB**: `wrangler d1 create dueli-db`
2. **Apply Migrations**: `wrangler d1 migrations apply dueli-db --remote`
3. **Bind**: Ensure `wrangler.jsonc` has the correct `database_id`.

## Deployment / النشر

Dueli is designed for **Cloudflare Pages**.

1. **Build**:
   ```bash
   npm run build
   ```
2. **Deploy**:
   ```bash
   npm run deploy
   ```
   *Uses `wrangler pages deploy dist`.*

### Secrets Management
Production secrets must be set manually on Cloudflare:
```bash
wrangler pages secret put GOOGLE_CLIENT_ID
wrangler pages secret put GOOGLE_CLIENT_SECRET
# ... etc
```

## Troubleshooting

- **"Table not found"**: You likely forgot to run `npm run db:migrate:local`.
- **Styles missing**: Run `npm run build:css`.
- **Login fails**: Check `.dev.vars` for correct OAuth credentials.