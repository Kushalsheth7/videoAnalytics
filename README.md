# CreatorJoy: Strategic RAG Comparison

A fully dynamic, full-stack RAG pipeline designed to ingest, chunk, embed, and compare social media videos (YouTube & Instagram Reels) for engagement and hook analysis.

## 🧠 Engineering & Architectural Decisions

When building this pipeline, the goal was to create the **highest-quality, lowest-cost** method capable of scaling, while anticipating the inevitable realities of scraping social media in production.

### 1. 100% Free, High-Performance AI Stack
I intentionally purged all OpenAI dependencies. Relying on GPT-4o for an MVP that scales to 1,000 creators/day is financial suicide. Instead, this stack uses:
- **LLM**: Llama 3 70B (via Groq) for conversational RAG. It's blazingly fast (essential for SSE streaming) and heavily rate-limited but free for the MVP.
- **Audio Transcription**: Groq's Whisper API (whisper-large-v3). Same reasoning.
- **Embeddings**: Local HuggingFace `all-MiniLM-L6-v2`. Rather than paying Cohere or OpenAI per token, I run a lightweight, highly capable embedding model locally. It's fast, free, and perfectly tuned for semantic similarity in conversational transcripts.

### 2. Instagram Scraping: The "Graceful Failover"
Social platforms (especially Instagram) aggressively block headless scrapers (like `yt-dlp`). If you try to blindly pull metadata in production, your pipeline *will* crash eventually. 

To solve this, I engineered a graceful fallback: if Instagram blocks the view/follower count, the system mathematically estimates them based on the `likes` ratio, and flags them as `(est.)` in the UI. The formulas are:
- **Views**: `max(12500, Likes × 15)`
- **Followers**: `max(4500, Likes × 8)`

Furthermore, the UI allows the creator to **manually edit and override** the metadata, instantly re-indexing the ChromaDB chunks on the fly. *The pipeline must never crash.*

### 3. Vector DB: Why Chroma?
For the MVP, I used **ChromaDB** with local persistence. Why? Because provisioning a Pinecone cluster for a local demo adds unnecessary latency and setup overhead. Chroma runs perfectly in-memory and saves to disk. 
**What breaks at 10,000 users?** Local SQLite-backed Chroma will face concurrent write-lock issues. At scale, I would instantly swap this out for **pgvector** (Postgres) because it allows us to store user relational data and vector data in the exact same transactional database, eliminating syncing bugs.

### 4. Chunking Strategy
I used LangChain's `RecursiveCharacterTextSplitter` with `chunk_size=500` and `chunk_overlap=50`. 
Why 500? YouTube and Reels transcripts are conversational, messy, and lack formal paragraph structure. A 1,000-character chunk dilutes the semantic meaning of a "hook". 500 characters tightly isolates a 10-15 second burst of dialogue, meaning when the LLM searches for the "first 5 seconds", it gets exactly the context it needs without hallucinating over irrelevant filler words.

### 5. Frontend: React (Vite) over Next.js
I chose React with Vite instead of Next.js. Why? Because this application is fundamentally a real-time, event-driven dashboard. We are streaming Server-Sent Events (SSE) from the backend directly to the chat panel. Server-Side Rendering (SSR) adds zero SEO benefit to a gated creator dashboard and only adds deployment overhead. Vite is faster to build and runs lighter in the browser.

### 6. Prompt Decoupling
All LLM prompts live in external `.txt` files under `backend/prompts/`, not buried inside Python code. This means a non-engineer (a prompt designer, a content strategist) can iterate on the AI's personality and instructions without touching a single line of code or restarting the server. In production, this would plug directly into an A/B testing framework.

---

## 📁 Project Structure

```
creatorjoy/
├── .env.example          # Template for environment variables
├── .gitignore
├── README.md
│
├── backend/
│   ├── main.py           # FastAPI app — all API routes live here
│   ├── config.py         # Pydantic settings loader (reads .env)
│   ├── requirements.txt
│   │
│   ├── llm/              # All LLM-calling logic, isolated
│   │   ├── core.py       # Central Groq client factory (single source of truth)
│   │   ├── rag.py        # RAG chain — prompt building, streaming, citations
│   │   └── transcriber.py # Audio download + Whisper transcription
│   │
│   ├── services/         # Non-LLM business logic
│   │   ├── scraper.py    # yt-dlp metadata extraction + fallback estimation
│   │   └── vector_store.py # ChromaDB: chunking, embedding, similarity search
│   │
│   └── prompts/          # Decoupled AI instructions (editable without code changes)
│       ├── system.txt    # Main system prompt with response instructions
│       └── context.txt   # RAG context injection template
│
└── frontend/
    ├── src/
    │   ├── App.jsx        # Main app — URL inputs, ingestion, chat orchestration
    │   └── components/
    │       ├── VideoCard.jsx  # Side-by-side metric cards with edit/override
    │       └── ChatPanel.jsx  # Streaming RAG chat with citations + presets
    └── index.css          # Full design system (dark theme, glassmorphism)
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check — returns API status |
| `POST` | `/api/process-videos` | Accepts two URLs, scrapes metadata, transcribes audio, chunks + embeds into ChromaDB |
| `POST` | `/api/update-video-data` | Accepts manually edited metadata/transcript, re-indexes ChromaDB chunks |
| `POST` | `/api/chat` | RAG query — retrieves relevant chunks, streams Llama 3 response via SSE with citations |

---

## ⚙️ Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | React + Vite | Real-time SSE dashboard, no SSR overhead needed |
| **Backend** | FastAPI (Python) | Async-native, auto-generated docs, perfect for streaming |
| **Orchestration** | LangChain | Mandatory per spec — handles message formatting, streaming, and chain logic |
| **LLM** | Llama 3 70B (Groq) | Fastest inference available, free tier, no cold starts |
| **Transcription** | Whisper large-v3 (Groq) | Free, accurate, handles Hindi/English code-switching well |
| **Embeddings** | HuggingFace `all-MiniLM-L6-v2` | Runs 100% locally, zero API cost, ~90MB download |
| **Vector DB** | ChromaDB (local persistence) | Zero setup, perfect for MVP, swappable to pgvector at scale |
| **Scraping** | `yt-dlp` + `youtube-transcript-api` | Official subtitle API for YouTube, yt-dlp fallback for Instagram |

---

## 🚀 How to Run Locally

### Prerequisites
- Node.js (v18+)
- Python 3.10+
- FFmpeg (Must be installed and on your system PATH for `yt-dlp` audio extraction)

### 0 Github
```bash
git clone https://github.com/Kushalsheth7/videAnalytics.git
```

### 1. Environment Setup
Create a `.env` file in the root directory based on the `.env.example`:
```env
GROQ_API_KEY="gsk_your_groq_api_key_here"
```
Get your free key at [console.groq.com/keys](https://console.groq.com/keys).

### 2. Backend (FastAPI + LangChain)
Open a terminal and navigate to the backend folder:
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```
*The API will run at http://127.0.0.1:8000*

### 3. Frontend (React + Vite)
Open a new terminal and navigate to the frontend folder:
```bash
cd frontend
npm install
npm run dev
```
*The app will run at http://localhost:5173*

---

## 🏗️ System Architecture Flow

```
User pastes 2 URLs (YouTube + Instagram)
         │
         ▼
┌─────────────────────────────────┐
│  POST /api/process-videos       │
│                                 │
│  1. yt-dlp extracts metadata    │
│     (title, likes, views, etc.) │
│                                 │
│  2. Transcript retrieval:       │
│     YouTube → youtube-transcript│
│     Instagram → Whisper (Groq)  │
│                                 │
│  3. RecursiveCharacterText      │
│     Splitter (500 chars)        │
│                                 │
│  4. HuggingFace MiniLM embeds   │
│     each chunk → ChromaDB       │
│     (tagged with video_id)      │
└─────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  POST /api/chat (SSE stream)    │
│                                 │
│  1. Query embedded → similarity │
│     search on ChromaDB (top 5)  │
│                                 │
│  2. Retrieved chunks injected   │
│     into Llama 3 context window │
│     with system prompt          │
│                                 │
│  3. Tokens streamed via SSE     │
│     with citation metadata      │
│     (video_id + chunk_index)    │
└─────────────────────────────────┘
         │
         ▼
   React UI renders streaming
   markdown + citation tags
```

---

## 💰 Cost Analysis: Scaling to 1,000 Creators/Day

| Resource | Cost per creator | At 1,000/day |
|----------|-----------------|-------------|
| Groq Llama 3 (LLM) | $0.00 (free tier) | $0.00* |
| Groq Whisper (transcription) | $0.00 (free tier) | $0.00* |
| HuggingFace embeddings | $0.00 (local) | $0.00 |
| ChromaDB | $0.00 (local) | $0.00 |
| **Total** | **$0.00** | **$0.00** |

*\*Groq free tier has rate limits (~6000 RPM). At 1,000 creators/day, you'd hit these limits and need to upgrade to Groq's paid tier ($0.59/M input tokens for Llama 3 70B) — still 10-20x cheaper than GPT-4o. Alternatively, self-host Llama 3 on a single A100 GPU ($1.50/hr on Lambda) for unlimited throughput.*

**The better alternative at true scale**: Self-hosted Llama 3 on vLLM + pgvector on managed Postgres (Supabase or Neon). This eliminates all third-party rate limits and keeps the per-creator cost under $0.002.
