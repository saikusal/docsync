# Shop API

Hand-written introduction that docsync must never touch.

## Environment variables

<!-- docsync:start env-vars -->
| Variable | Required | Used in |
| --- | --- | --- |
| `API_KEY` | No | `src/middleware/auth.ts` |
| `DATABASE_URL` | Yes | `src/server.ts` |
| `LOG_LEVEL` | Not Found | Not Found |
| `PORT` | No | `src/server.ts` |
<!-- docsync:end env-vars -->

## API endpoints

<!-- docsync:start api-endpoints -->
| Method | Path | Source |
| --- | --- | --- |
| GET | `/api/orders` | `src/routes/orders.ts` |
| GET | `/api/orders/:id` | `src/routes/orders.ts` |
| GET | `/health` | `src/server.ts` |
<!-- docsync:end api-endpoints -->

## Setup

<!-- docsync:start setup -->
**Prerequisites**

- Node.js: `>=22.12`
- Package manager: npm

**Install**

```sh
npm install
```

**Scripts**

| Script | Run with | Command |
| --- | --- | --- |
| `build` | `npm run build` | `tsc -p .` |
| `start` | `npm run start` | `node dist/server.js` |
| `test` | `npm run test` | `vitest run` |
<!-- docsync:end setup -->

## License

Hand-written license note.

## Overview

<!-- docsync:start overview -->
| Field | Value |
| --- | --- |
| Name | `shop-api` |
| Description | Order management API |
| Version | `2.3.1` |
| License | Not Found |
| Default branch | Not Found |
| Topics | Not Found |
| Latest release | Not Found |
<!-- docsync:end overview -->

## Tech stack

<!-- docsync:start tech-stack -->
- **Runtime:** Node.js `>=22.12`
- **Language:** TypeScript

| Package | Version | Type |
| --- | --- | --- |
| `express` | `^4.21.2` | runtime |
| `pg` | `^8.13.0` | runtime |
| `typescript` | `~6.0.3` | dev |
| `vitest` | `^5.0.3` | dev |
<!-- docsync:end tech-stack -->

## Project structure

<!-- docsync:start project-structure -->
| Folder | Purpose |
| --- | --- |
| `docs/` | Documentation |
| `src/` | Source code |
| `tests/` | Tests |
<!-- docsync:end project-structure -->
