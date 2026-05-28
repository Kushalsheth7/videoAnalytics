import os
import shutil
import logging
import threading
from typing import List
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
# from langchain_huggingface import HuggingFaceEmbeddings
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_core.documents import Document
from config import settings

# Attempt to limit PyTorch RAM usage for Render Free Tier (512MB limit)
# try:
#     import torch
#     torch.set_num_threads(1)
# except ImportError:
#     pass

logger = logging.getLogger(__name__)

# Fallback in-memory DB in case persist fails or to keep things simple
_vector_store_instance = None
_vector_store_lock = threading.Lock()

def get_embedding_function():
    """Initializes and returns the embeddings function. 
    Swapped to Gemini Free API because local PyTorch model OOMs on Render's 512MB free tier."""
    
    # --- ORIGINAL LOCAL IMPLEMENTATION (Commented out for deployment) ---
    # logger.info(f"Loading local HuggingFace Embeddings: {settings.EMBEDDING_MODEL}...")
    # return HuggingFaceEmbeddings(model_name=settings.EMBEDDING_MODEL)
    
    # --- RENDER DEPLOYMENT IMPLEMENTATION (Free Network API) ---
    logger.info("Loading Google Gemini Embeddings API (Network-based to save RAM)...")
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is missing from environment variables!")
    return GoogleGenerativeAIEmbeddings(
        model="models/text-embedding-004", 
        google_api_key=settings.GEMINI_API_KEY
    )

def get_vector_store(force_recreate: bool = False) -> Chroma:
    """Gets or initializes the persistent Chroma vector store."""
    global _vector_store_instance
    
    persist_dir = settings.CHROMA_PERSIST_DIRECTORY
    
    with _vector_store_lock:
        if force_recreate:
            reset_vector_store()
            _vector_store_instance = None

        if _vector_store_instance is None:
            embeddings = get_embedding_function()
            
            # Ensure persistence directory exists
            os.makedirs(persist_dir, exist_ok=True)
            
            logger.info(f"Initializing ChromaDB persisted at: {persist_dir}")
            _vector_store_instance = Chroma(
                collection_name="creatorjoy_rag",
                embedding_function=embeddings,
                persist_directory=persist_dir
            )
            
    return _vector_store_instance

def reset_vector_store():
    """Deletes the existing Chroma DB files to reset state completely."""
    global _vector_store_instance
    persist_dir = settings.CHROMA_PERSIST_DIRECTORY
    logger.info(f"Resetting Vector Store. Deleting directory {persist_dir}...")
    
    # Close instance if any
    _vector_store_instance = None
    
    # Delete directory
    if os.path.exists(persist_dir):
        try:
            # Add a slight delay or retry loop if OS file lock exists
            shutil.rmtree(persist_dir)
            logger.info("Successfully deleted vector store persistence directory.")
        except Exception as e:
            logger.warning(f"Could not delete persistence directory: {e}. Clearing collection instead.")
            # Fallback: if we can't delete directory due to process locks, we will clear collection later

def add_video_transcript(video_id: str, transcript: str, metadata: dict) -> List[str]:
    """Chunks a video transcript, tags each chunk, and adds it to ChromaDB."""
    logger.info(f"Chunking and embedding video transcript for Video {video_id}...")
    
    # Configure splitter
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=50,
        length_function=len,
        separators=["\n\n", "\n", ".", " ", ""]
    )
    
    # Split text into chunks
    chunks = splitter.split_text(transcript)
    logger.info(f"Split transcript into {len(chunks)} chunks.")
    
    # Create Document objects with metadata tags
    documents = []
    for i, chunk in enumerate(chunks):
        doc_metadata = {
            "video_id": video_id,
            "chunk_index": i,
            "title": metadata.get("title", ""),
            "creator": metadata.get("creator", ""),
            "platform": metadata.get("platform", ""),
            "url": metadata.get("url", "")
        }
        documents.append(Document(page_content=chunk, metadata=doc_metadata))
        
    # Get vector store and add documents
    db = get_vector_store()
    
    # If the collection already contains old documents for this video_id, clean them up
    try:
        db.delete(where={"video_id": video_id})
        logger.info(f"Deleted existing documents for video_id: {video_id}")
    except Exception as e:
        logger.warning(f"Could not delete old video chunks (might be empty collection): {e}")

    ids = db.add_documents(documents)
    logger.info(f"Added {len(ids)} document chunks to ChromaDB.")
    return ids

def similarity_search(query: str, k: int = 5) -> List[Document]:
    """Performs a similarity search in the vector store."""
    db = get_vector_store()
    logger.info(f"Performing vector similarity search for query: '{query}' with k={k}")
    return db.similarity_search(query, k=k)
