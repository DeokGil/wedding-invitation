**English** | [한국어](./README.md)

# Mobile Wedding Invitation (Node + GitHub Pages)

This project has been migrated from FastAPI to a **Node (Vite) static app**.

## What changed

- Deployment: GitHub Pages (`/<repo>/`)
- Runtime: Node + Vite (vanilla JS)

## Stack

- Frontend: Vite, Vanilla JavaScript
- Hosting: GitHub Pages + GitHub Actions

## Quick start

### 1) Install

```bash
npm install
cp .env.example .env
```

### 2) Configure env

Set this in `.env`:

- `VITE_KAKAO_APP_KEY` (optional)

### 3) Run locally

```bash
npm run dev
```

### 4) Build check

```bash
npm run build
npm run preview
```

## GitHub Pages deployment

Auto deploy is configured via `.github/workflows/pages.yml` on `main` pushes.

Repository variable:

- `VITE_KAKAO_APP_KEY` (optional)

See [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) for details.

## Project layout

```text
wedding-invitation/
├── .github/workflows/pages.yml
├── config/config.json
├── public/
│   └── static/
├── index.html
├── package.json
└── vite.config.js
```

## License

CC BY-NC-SA
