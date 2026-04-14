# Deployment Guide (GitHub Pages)

## 1. Prerequisites

- GitHub repository
- Node.js 20+

## 2. Local setup

```bash
cp .env.example .env
npm install
```

`.env` example:

```env
VITE_KAKAO_APP_KEY=your_kakao_javascript_key
```

## 3. Local verification

```bash
npm run dev
npm run build
npm run preview
```

## 4. GitHub Pages deployment

Deployment workflow is defined in `.github/workflows/pages.yml`.

Repository variable (optional):

- `VITE_KAKAO_APP_KEY`

Push to `main` to trigger automatic deployment.
