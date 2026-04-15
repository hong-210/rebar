# RebarMaster Pro - 독립 실행 가이드

이 프로젝트는 AI Studio에서 내보내어 독립적으로 관리하고 실행할 수 있도록 구성되었습니다.

## 시작하기

### 1. 필수 요구 사항
- [Node.js](https://nodejs.org/) (v18 이상 권장)
- npm 또는 yarn

### 2. 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```

서버가 실행되면 브라우저에서 `http://localhost:3000`으로 접속할 수 있습니다.

### 3. 환경 변수 설정

프로젝트 실행에 필요한 환경 변수를 설정합니다.

1. 프로젝트 루트에 `.env` 파일을 생성합니다.
2. `.env.example` 내용을 참조하여 필요한 설정을 추가합니다.

### 4. 프로젝트 구조

- `App.tsx`: 메인 애플리케이션 로직 및 라우팅
- `components/`: UI 컴포넌트 모음
- `services/`: Gemini API 연동 서비스
- `types.ts`: TypeScript 타입 정의
- `index.css`: Tailwind CSS 및 글로벌 스타일

## 주요 스크립트

- `npm run dev`: 개발 모드로 실행
- `npm run build`: 프로덕션용 빌드 생성
- `npm run preview`: 빌드된 결과물 미리보기

## 기술 스택

- **Frontend**: React 19, Vite 6, TypeScript
- **Styling**: Tailwind CSS v4
- **Icons**: Lucide React
- **Charts**: Recharts
