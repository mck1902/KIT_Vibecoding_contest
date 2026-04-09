# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**EduWatch** — AI-powered learning attitude monitoring service for online lecture students. Uses browser-based TensorFlow.js (MobileNet V3 Large) for real-time facial expression classification and Claude API for RAG-based parent reports. Privacy-first: video never leaves the browser; only numerical focus classifications (1–5) are sent to the server.

## Build & Run Commands

### Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev        # Dev server on port 5173 (proxies /api to backend:5000)
npm run build      # Production build → dist/
npm run preview    # Preview production build
npm run lint       # ESLint
```

### Backend (Express + MongoDB)
```bash
cd backend
npm install
npm run dev        # Nodemon dev server on port 5000
npm start          # Production
```

### AI Model Scripts (Python)
```bash
cd scripts
python convert_model.py   # H5 → TF.js conversion to frontend/public/models/mobilenet/
python verify_model.py    # Model structure validation
```

### Required Environment (backend/.env)
- `MONGODB_URI` — MongoDB connection string
- `ANTHROPIC_API_KEY` — Claude API key
- `PORT` — defaults to 5000

## Architecture

Two separate npm projects (no monorepo tooling):

**Frontend** (`frontend/`) — React 19 + Vite 8, React Router 7, Recharts. Vite proxies `/api/*` to the backend.

**Backend** (`backend/`) — Express 5 + Mongoose 9 + @anthropic-ai/sdk. Standard MVC layout under `backend/src/`: `routes/` → `controllers/` → `models/` + `utils/`.

### Key Data Flow
1. StudentDashboard captures webcam → TF.js classifies focus status (1–5) in-browser
2. Classifications batch-posted to `POST /api/sessions/:id/records`
3. Tab departures tracked via Page Visibility API → `POST /api/sessions/:id/departures`
4. Rule-based report: `GET /api/sessions/:id/report` (avgFocus, chartData, tips)
5. Claude RAG analysis: `GET /api/sessions/:id/rag-analysis` (combines focus data + lecture subtitle segments → cached in MongoDB)

### Focus Classification (5 Classes)
1. 집중 + 흥미로움 / 2. 집중 + 차분함 / 3. 비집중 + 차분함 / 4. 비집중 + 지루함 / 5. 졸음

### API Endpoints
- `/api/sessions` — CRUD + `PUT /:id/end`, `POST /:id/records`, `POST /:id/departures`, `GET /:id/report`, `GET /:id/rag-analysis`
- `/api/lectures` — `GET /` list, `POST /:id/analyze` (Claude subtitle analysis, cached)

### Routes (Frontend)
`/` Landing · `/login` · `/student` Dashboard · `/student/report/:sessionId` · `/parent` Dashboard

## Key Design Decisions

- **Two-phase AI**: Phase 1 simulates classification with real face detection; Phase 2 uses the converted MobileNet model for actual inference
- **Claude API fallback**: If Claude API fails, rule-based tips are returned instead
- **Caching**: Both lecture analysis and RAG reports are cached in MongoDB after first generation to minimize API calls
- **Claude model**: Uses `claude-sonnet-4-6` for content analysis and RAG reports (configured in `backend/src/utils/claudeService.js`)
- **Subtitle data**: SRT files in `backend/data/subtitles/` are parsed by `subtitleParser.js` for Claude context

## Deployment

- Frontend → Vercel (`npm run build`)
- Backend → Render (`npm start`)
- HTTPS required for webcam access in production

## Current Branch Task (feat/tfjs-model)
- Replace random focus simulation in StudentDashboard.jsx with real TF.js inference
- Converted model: frontend/public/models/mobilenet/ (model.json + 3 shards, 12MB)
- Model input: 224x224x3 RGB image, output: 5-class softmax
- Pipeline: Webcam → Face detection (MediaPipe) → Crop 224x224 → Model inference → Status 1-5
- Refer to docs/SPEC-AI.md for detailed AI spec

## Notes
- 한국어로 대화
- JavaScript/Node.js 초보 (Python 배경)