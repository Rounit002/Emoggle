# Emoggle

An Omegle-style live face duel where two strangers match the same emoji and compete for the closest expression score.

## Project Structure

```
Emoggle/
├── frontend/          # Next.js (App Router) + Tailwind CSS + PeerJS
├── signaling-server/  # Node.js + Express + Socket.io (matchmaking)
└── ai-judge/          # Python + FastAPI (AI fashion critic)
```

## Running Locally

### 1. Signaling Server (port 3001)
```bash
cd signaling-server
npm install
npm run dev
```

### 2. AI Judge (port 8000)
```bash
cd ai-judge
pip install -r requirements.txt
python main.py
```

The judge runs in random demo mode by default with `JUDGE_MODE=random`. Later, set `JUDGE_MODE=ai` and add `GEMINI_API_KEY` in `ai-judge/.env` to enable Gemini outfit analysis.

### 3. Frontend (port 3000)
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 in **two separate browser tabs** to simulate two users.

## Environment Variables

Copy `.env.example` to `.env.local` in `frontend/` and fill in values.

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15, Tailwind CSS, framer-motion, react-webcam, PeerJS |
| Matchmaking | Node.js, Express, Socket.io |
| AI Judge | Python, FastAPI, uvicorn, Pydantic |
