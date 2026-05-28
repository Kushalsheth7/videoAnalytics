import logging
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from services.scraper import scrape_video_data
from services.vector_store import add_video_transcript, reset_vector_store
from llm.rag import stream_rag_response
from config import settings

# Configure logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Creatorjoy RAG Chatbot API",
    description="Decoupled backend for scraping videos, embedding transcripts, and streaming comparison analytics.",
    version="1.0.0"
)

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this to the frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === PYDANTIC SCHEMAS ===

class ProcessRequest(BaseModel):
    video_a_url: str = Field(..., description="YouTube URL (Video A)")
    video_b_url: str = Field(..., description="Instagram Reels URL (Video B)")

class ChatMessage(BaseModel):
    role: str = Field(..., description="Role: 'user' or 'assistant'")
    content: str = Field(..., description="Message text content")

class ChatRequest(BaseModel):
    query: str = Field(..., description="User's prompt")
    history: List[ChatMessage] = Field(default=[], description="Chat history list")
    video_a: Dict[str, Any] = Field(..., description="Metadata for Video A")
    video_b: Dict[str, Any] = Field(..., description="Metadata for Video B")

class UpdateVideoRequest(BaseModel):
    video_id: str = Field(..., pattern="^(A|B)$", description="Which video: 'A' or 'B'")
    transcript: str = Field(..., description="Modified transcript content")
    metadata: Dict[str, Any] = Field(..., description="Modified video metadata")

# === ROUTES ===

@app.get("/api/health")
def health_check():
    """Simple API status health check."""
    return {"status": "ok", "message": "Creatorjoy RAG API is fully functional."}

@app.post("/api/process-videos")
def process_videos(request: ProcessRequest):
    """Processes, scrapes, and indexes both Video A (YouTube) and Video B (Instagram Reels)."""
    logger.info(f"Processing comparison for: Video A={request.video_a_url}, Video B={request.video_b_url}")
    
    # 1. Reset/Clear ChromaDB to prevent cross-session contamination
    reset_vector_store()
    
    # 2. Scrape/extract data for Video A (YouTube)
    logger.info("Scraping Video A...")
    try:
        video_a_data = scrape_video_data(request.video_a_url)
        # Ensure it has tags matching A
        video_a_data["video_id"] = "A"
    except Exception as e:
        logger.error(f"Failed to scrape Video A: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to process Video A: {str(e)}")
        
    # 3. Scrape/extract data for Video B (Instagram Reel)
    logger.info("Scraping Video B...")
    try:
        video_b_data = scrape_video_data(request.video_b_url)
        # Ensure it has tags matching B
        video_b_data["video_id"] = "B"
    except Exception as e:
        logger.error(f"Failed to scrape Video B: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to process Video B: {str(e)}")

    # 4. Chunk, embed, and index transcripts
    try:
        logger.info("Indexing Video A transcript chunks...")
        add_video_transcript("A", video_a_data["transcript"], video_a_data)
        
        logger.info("Indexing Video B transcript chunks...")
        add_video_transcript("B", video_b_data["transcript"], video_b_data)
    except Exception as e:
        logger.warning(f"Failed to write transcripts to ChromaDB: {e}. Running with empty/partial index.")

    return {
        "success": True,
        "video_a": video_a_data,
        "video_b": video_b_data
    }

@app.post("/api/update-video-data")
def update_video_data(request: UpdateVideoRequest):
    """Re-chunks and re-indexes video transcript after manual frontend edits."""
    logger.info(f"Updating data and re-indexing Vector Store for Video {request.video_id}...")
    
    metadata = request.metadata
    transcript = request.transcript
    video_id = request.video_id
    
    # Recalculate engagement rate in case views/likes/comments were edited
    try:
        views = int(metadata.get("views", 0))
        likes = int(metadata.get("likes", 0))
        comments = int(metadata.get("comments", 0))
        if views > 0:
            metadata["engagement_rate"] = round(((likes + comments) / views) * 100, 2)
        else:
            metadata["engagement_rate"] = 0.0
    except Exception as e:
        logger.warning(f"Error recalculating engagement: {e}")
        
    # Re-index chunks
    try:
        add_video_transcript(video_id, transcript, metadata)
    except Exception as e:
        logger.error(f"Failed to re-index Vector Store: {e}")
        raise HTTPException(status_code=500, detail=f"Vector store update failed: {str(e)}")
        
    return {
        "success": True,
        "video_data": {
            **metadata,
            "transcript": transcript,
            "video_id": video_id
        }
    }

@app.post("/api/chat")
def chat(request: ChatRequest):
    """Streams comparative RAG answers citing sources and retaining conversational history."""
    logger.info(f"New RAG chat query: '{request.query}'")
    
    # Convert Pydantic ChatMessages to standard list-of-dict format for backend service
    history_dicts = [{"role": msg.role, "content": msg.content} for msg in request.history]
    
    # Stream the SSE payload
    return StreamingResponse(
        stream_rag_response(
            query=request.query,
            history=history_dicts,
            video_a_meta=request.video_a,
            video_b_meta=request.video_b
        ),
        media_type="text/event-stream"
    )

if __name__ == "__main__":
    import uvicorn
    logger.info(f"Starting uvicorn server on port {settings.PORT}...")
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=True)
