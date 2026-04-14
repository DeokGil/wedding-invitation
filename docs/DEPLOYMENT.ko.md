# GitHub Pages 배포 가이드

## 1. 사전 준비

- GitHub 저장소
- Node.js 20+

## 2. 로컬 환경 설정

```bash
cp .env.example .env
npm install
```

`.env` 예시:

```env
VITE_KAKAO_APP_KEY=your_kakao_javascript_key
```

## 3. 로컬 테스트

```bash
npm run dev
npm run build
npm run preview
```

## 4. GitHub Pages 배포

이 프로젝트는 `.github/workflows/pages.yml`을 사용합니다.

Repository Variables 설정(선택):

- `VITE_KAKAO_APP_KEY`

`main` 브랜치에 push 하면 자동으로 Pages에 배포됩니다.
