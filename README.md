# CreatorJoy: Strategic RAG Video Comparison Chatbot

A fully dynamic, full-stack RAG pipeline that ingests, transcribes, and compares social media videos (YouTube & Instagram Reels) — then powers a streaming AI chatbot for engagement analysis and hook comparison.

---

## 🧠 Engineering & Architectural Decisions

### 1. 100% Free AI Stack
This stack was deliberately built to cost **$0** for the MVP:
- **LLM**: Llama 3.3 70B via **Groq** — fastest inference available (~500 tokens/sec), perfect for SSE streaming.
- **Transcription**: Groq **Whisper large-v3** — free, accurate, handles mixed Hindi/English.
- **Embeddings**: **FastEmbed** (`BAAI/bge-small-en-v1.5`) — runs on ONNX locally, ~100MB RAM, zero PyTorch needed, zero API cost.
- **Vector DB**: **ChromaDB** (local persistence) — no cloud subscription, zero cost for MVP.

### 2. Instagram Scraping Strategy
Instagram aggressively blocks headless scrapers. The pipeline handles this with a two-layer approach:

**Layer 1 — `instaloader`** (metadata enrichment): Uses Instagram's mobile GraphQL API to reliably fetch:
- Views (`video_view_count`)
- Likes, comments
- Creator follower count
- Caption (used as title)

**Layer 2 — `yt-dlp`** (audio extraction): Pulls the video stream for Whisper transcription. Works without authentication for most public Reels.

If both fail (private post), the UI renders an **edit drawer** so the user can paste real metrics and transcripts manually — ChromaDB re-indexes instantly on save. The pipeline never crashes.

### 3. YouTube Scraping Strategy
- **Primary**: `youtube-transcript-api` — grabs auto-captions in milliseconds at zero cost.
- **Fallback 1**: `yt-dlp` with `tv_embedded`/`android_vr` clients + `ignore_no_formats_error=True` — bypasses the new PO Token requirement and returns metadata even when formats are blocked.
- **Fallback 2**: Open-source **Invidious API** (`vid.puffyan.us`) — returns real title, views, likes, duration when yt-dlp is blocked by IP.

### 4. Chunking Strategy
`RecursiveCharacterTextSplitter` with `chunk_size=500`, `chunk_overlap=50`.

Why 500 chars? YouTube/Reels transcripts are conversational. A 500-char chunk isolates roughly 10–15 seconds of dialogue, meaning when the LLM searches for "the first 5 seconds", it retrieves exactly that snippet without irrelevant filler.

### 5. Prompt Decoupling
All LLM prompts live in `backend/prompts/*.txt` files — not in Python code. A non-engineer can iterate on the AI's tone and instructions without touching code or restarting the server.

### 6. Frontend Architecture
React + Vite over Next.js — this is a real-time SSE streaming dashboard. SSR adds zero SEO benefit and only adds deployment overhead for a gated creator tool.

---

## 🛑 Real Problems Faced & Solutions

### Problem 1: YouTube PO Token Requirement (May 2026)
`yt-dlp` with `ios` and `android_creator` clients started requiring a GVS PO Token — both returned "No video formats found!".

**Fix**: Switched to `tv_embedded` + `android_vr` clients which bypass this requirement, and added `ignore_no_formats_error=True` so metadata is always returned even when formats are blocked.

### Problem 2: Instagram Chrome Cookie Extraction Fails on Windows
Attempted `yt-dlp --cookiesfrombrowser chrome` but Windows Chrome holds a database lock while running, causing "Could not copy Chrome cookie database" errors.

**Fix**: Dropped the cookie layer entirely. Use `instaloader` directly for all metadata (views, likes, comments, follower count) — it hits Instagram's mobile API without needing cookies for public posts. `yt-dlp` is only used separately for audio download.

### Problem 3: HuggingFace Embeddings + PyTorch = OOM
`sentence-transformers` requires PyTorch (~1.5GB RAM), which crashes on Render's 512MB free tier.

**Fix**: Replaced with **FastEmbed** (ONNX runtime). Sub-100MB, runs on CPU, fully local, same embedding quality for this task.

### Problem 4: YouTubeTranscriptApi Breaking Change
Older code called `YouTubeTranscriptApi.get_transcript(video_id)` as a static method — the updated library requires instantiation: `api = YouTubeTranscriptApi(); transcript_list = api.list(video_id)`.

**Fix**: Updated to the new instantiation pattern with language fallback (`en` → any available).

---

## 📁 Project Structure

```
creatorjoy/
├── .env                  # Active environment config (not committed)
├── .env.example          # Template for environment variables
├── .gitignore
├── README.md
│
├── backend/
│   ├── main.py           # FastAPI app — all API routes
│   ├── config.py         # Pydantic settings loader (.env)
│   ├── requirements.txt
│   │
│   ├── llm/              # All LLM-calling logic, isolated
│   │   ├── core.py       # Central Groq client factory
│   │   ├── rag.py        # RAG chain — streaming, citations, memory
│   │   └── transcriber.py # Audio download + Groq Whisper transcription
│   │
│   ├── services/         # Non-LLM business logic
│   │   ├── scraper.py    # yt-dlp + instaloader + YouTube transcript extraction
│   │   └── vector_store.py # ChromaDB: chunking, FastEmbed, similarity search
│   │
│   └── prompts/          # Decoupled AI instructions
│       ├── system.txt    # Main system prompt
│       └── context.txt   # RAG context injection template
│
└── frontend/
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── App.jsx        # URL inputs, ingestion pipeline, SSE parser, state
        ├── index.css      # Full design system (dark theme, glassmorphism)
        └── components/
            ├── VideoCard.jsx  # Metric cards + manual edit drawer
            └── ChatPanel.jsx  # Streaming RAG chat with citations + presets
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/process-videos` | Scrape, transcribe, chunk + embed two videos |
| `POST` | `/api/update-video-data` | Re-index manually edited metadata/transcript |
| `POST` | `/api/chat` | RAG query — streams Llama 3 response via SSE with citations |

---

## ⚙️ Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | React + Vite | SSE streaming dashboard, no SSR overhead |
| **Backend** | FastAPI (Python) | Async-native, perfect for streaming |
| **Orchestration** | LangChain | Handles message formatting, streaming, chain logic |
| **LLM** | Llama 3.3 70B (Groq) | Fastest inference, free tier, no cold starts |
| **Transcription** | Whisper large-v3 (Groq) | Free, multilingual, handles code-switching |
| **Embeddings** | FastEmbed `BAAI/bge-small-en-v1.5` | 100% local, ONNX, <100MB RAM, zero cost |
| **Vector DB** | ChromaDB (local) | Zero setup, swappable to pgvector at scale |
| **YT Scraping** | `yt-dlp` + `youtube-transcript-api` + Invidious | Three-layer fallback for reliability |
| **IG Scraping** | `instaloader` + `yt-dlp` | instaloader for metadata, yt-dlp for audio |

---

## 🚀 How to Run Locally

### Prerequisites
- Python 3.10+
- Node.js v18+
- FFmpeg (on system PATH — required for audio extraction)
- A free Groq API key from [console.groq.com/keys](https://console.groq.com/keys)

### 1. Clone & Configure

```bash
git clone https://github.com/Kushalsheth7/videoAnalytics.git
cd videoAnalytics
```

Copy the environment template and add your Groq key:
```bash
cp .env.example .env
# Edit .env → set GROQ_API_KEY=gsk_your_key_here
```

### 2. Backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
python main.py
```

API runs at **http://127.0.0.1:8000** — verify with `/api/health`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at **http://localhost:5173**

---

## 🏗️ Data Flow

```
User pastes YouTube URL + Instagram Reel URL
              │
              ▼
    POST /api/process-videos
              │
    ┌─────────┴──────────┐
    │ YouTube            │ Instagram
    │                    │
    │ 1. youtube-        │ 1. instaloader →
    │    transcript-api  │    views, likes,
    │    (captions)      │    comments, followers
    │                    │
    │ 2. yt-dlp fallback │ 2. yt-dlp → audio
    │    (android_vr)    │    → Groq Whisper
    │                    │    → transcript
    │ 3. Invidious API   │
    │    fallback        │
    └─────────┬──────────┘
              │
    RecursiveCharacterTextSplitter
    (500 chars, 50 overlap)
              │
    FastEmbed ONNX → ChromaDB
    (tagged: video_id A or B)
              │
              ▼
    POST /api/chat (SSE)
              │
    Similarity search (top 5 chunks)
              │
    Llama 3.3 70B via Groq
    System prompt + video metadata + retrieved chunks
              │
    Streamed tokens + citation metadata
              │
              ▼
    React ChatPanel renders markdown + citations
```

---

## 💰 Cost Analysis: 1,000 Creators/Day

| Resource | Cost |
|----------|------|
| Groq Llama 3.3 70B (LLM) | $0 (free tier) |
| Groq Whisper (transcription) | $0 (free tier) |
| FastEmbed embeddings | $0 (local ONNX) |
| ChromaDB | $0 (local) |
| instaloader | $0 (open source) |
| **Total MVP cost** | **$0** |

**At true scale** (>6,000 RPM Groq limit): Self-host Llama 3.3 on vLLM + pgvector on Supabase. Per-creator cost drops to under $0.002. Still 20× cheaper than GPT-4o.
