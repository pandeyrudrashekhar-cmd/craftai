# CraftAI Website Builder

CraftAI is an AI-assisted website builder for creating, editing, previewing, versioning, publishing, and deploying project files. It includes GitHub repository integration, Vercel deployment, guarded Netlify deployment, ZIP export, and DNS-only custom-domain verification.

## Tech Stack

- Client: React 19, Vite, Tailwind CSS, Zustand, Monaco Editor
- Server: Node.js, Express, Prisma, PostgreSQL
- Integrations: GitHub OAuth/API, Vercel API, Netlify API

## Prerequisites

- Node.js 20+
- PostgreSQL (local or Neon)

## Run Locally

1. Copy `.env.example` to `server/.env` and configure the variables below. The local API uses port `5000`; `client/.env` should point `VITE_API_URL` to `http://localhost:5000/api`.
2. Install dependencies: `npm install` and `npm run install:all`.
3. Generate Prisma Client: `npm run db:generate`.
4. For local development, run `npm run db:migrate`. For production/release environments, run `npx prisma migrate deploy` from `server` after installing dependencies.
5. Start both applications with `npm run dev`, or separately with `npm run dev --prefix server` and `npm run dev --prefix client`.
6. Open `http://localhost:5173`.

## Environment Variables

Required server variables are `DATABASE_URL` and a 32-character minimum `JWT_SECRET`. AI features use `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`. GitHub uses `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `GITHUB_CALLBACK_URL`. `VERCEL_TOKEN` enables Vercel deployment.

Netlify additionally requires `NETLIFY_TOKEN`, `NETLIFY_BUILD_WORKER_URL`, and `NETLIFY_BUILD_WORKER_SECRET`. The API never runs project build scripts locally; the external worker must isolate builds and implement the documented HMAC request/response contract.

`CUSTOM_DOMAIN_TARGET` is required for DNS CNAME verification. Custom domains are DNS-verification-only; provider routing, TLS provisioning, and active serving are not implemented.

## Features

- Project and file workspace with Monaco editing and isolated preview
- AI-assisted file generation and editing
- Version history, restore, ZIP download, and Publish Website
- GitHub OAuth, repository/branch selection, and push
- Vercel deployment and guarded Netlify deployment
- Deployment history, recovery metadata, and scoped artifact cleanup

The API health check is at `http://localhost:5000/api/health`.

## Test a Vercel deployment

1. Add `VERCEL_TOKEN` to `server/.env` and restart the server.
2. Start the application and open a project that contains its current files.
3. Open the `Deploy` tab and click `Deploy to Vercel`.
4. Wait for the deployment to change from `BUILDING` to `READY`.
5. Open the URL shown in the deployment row.

Without `VERCEL_TOKEN`, the server returns a configuration error and does not create a deployment record.

The Netlify worker request timeout is 120 seconds. A timeout, invalid signature, invalid response, unsafe output, or provider failure marks the deployment `FAILED`; the API does not execute a local fallback. Requests contain only `{ projectId, files: [{ path, contentBase64 }] }` and use HMAC signatures in `X-CraftAI-Worker-Timestamp` and `X-CraftAI-Worker-Signature`. Responses must use the same signed-header contract. Netlify deployment remains disabled until the real isolated worker exists.

The worker request timeout is 120 seconds. A timeout, invalid signature, invalid response, unsafe output, or provider failure marks the deployment `FAILED`; the API does not execute a local fallback. Provider polling uses bounded attempts, and startup reconciliation re-reads existing provider IDs instead of creating duplicate provider jobs. Same-process recovery suppresses duplicate work, but durable cross-process retries and queue ownership require external infrastructure.

Custom domains currently support DNS CNAME verification only. CraftAI does not yet provision provider routing or TLS, so a verified DNS record is not presented as an active routed website.
