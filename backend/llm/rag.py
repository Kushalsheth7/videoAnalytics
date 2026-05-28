import os
import json
import logging
from typing import List, Dict, Any, Generator
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from llm.core import get_chat_llm
from services.vector_store import similarity_search
from config import settings

logger = logging.getLogger(__name__)

def build_system_message(video_a_meta: dict, video_b_meta: dict) -> SystemMessage:
    """Builds the comprehensive system message injecting metadata for both videos."""
    
    metadata_a_str = json.dumps(video_a_meta, indent=2)
    metadata_b_str = json.dumps(video_b_meta, indent=2)
    
    # Read the prompt from the external text file
    prompt_path = os.path.join(os.path.dirname(__file__), "..", "prompts", "system.txt")
    with open(prompt_path, "r", encoding="utf-8") as f:
        prompt_template = f.read()
        
    prompt_text = prompt_template.format(
        metadata_a_str=metadata_a_str,
        metadata_b_str=metadata_b_str
    )
    return SystemMessage(content=prompt_text)

def stream_rag_response(
    query: str, 
    history: List[Dict[str, str]], 
    video_a_meta: dict, 
    video_b_meta: dict
) -> Generator[str, None, None]:
    """Retrieves context, formats prompt, and streams LLM tokens + citations as Server-Sent Events (SSE)."""
    
    # Groq LLM configuration
    api_key = settings.GROQ_API_KEY
    model_name = settings.LLM_MODEL
        
    if not api_key:
        yield f"data: {json.dumps({'type': 'error', 'content': 'No GROQ_API_KEY configured.'})}\n\n"
        return

    try:
        # 1. Retrieve transcript chunks from ChromaDB
        # We query for related transcripts
        retrieved_docs = similarity_search(query, k=5)
        
        # Prepare context text from chunks
        context_blocks = []
        citations = []
        for i, doc in enumerate(retrieved_docs):
            video_label = "Video A" if doc.metadata.get("video_id") == "A" else "Video B"
            context_blocks.append(
                f"[{video_label} - Chunk {i+1}]: {doc.page_content}"
            )
            citations.append({
                "video_id": doc.metadata.get("video_id"),
                "platform": doc.metadata.get("platform"),
                "title": doc.metadata.get("title"),
                "snippet": doc.page_content[:150] + "..." if len(doc.page_content) > 150 else doc.page_content,
                "chunk_index": doc.metadata.get("chunk_index")
            })

        context_text = "\n\n".join(context_blocks)
        
        # Send citations first in the SSE stream
        yield f"data: {json.dumps({'type': 'citations', 'content': citations})}\n\n"
        
        # 2. Build the messages history
        messages = []
        
        # Inject the core system prompt with metadata
        messages.append(build_system_message(video_a_meta, video_b_meta))
        
        # Add conversation history
        for msg in history:
            role = msg.get("role")
            content = msg.get("content", "")
            if role == "user":
                messages.append(HumanMessage(content=content))
            elif role == "assistant":
                messages.append(AIMessage(content=content))
                
        # Inject retrieved chunks as contextual helper using external text file
        context_prompt_path = os.path.join(os.path.dirname(__file__), "..", "prompts", "context.txt")
        with open(context_prompt_path, "r", encoding="utf-8") as f:
            context_template = f.read()
            
        context_prompt = context_template.format(
            context_text=context_text,
            query=query
        )
        messages.append(HumanMessage(content=context_prompt))
        
        # 3. Initialize Chat model via llm core module
        llm = get_chat_llm()
        
        # 4. Stream response tokens
        logger.info("Starting LLM stream invocation...")
        for chunk in llm.stream(messages):
            if chunk.content:
                yield f"data: {json.dumps({'type': 'token', 'content': chunk.content})}\n\n"
                
        # Send completed status
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    except Exception as e:
        logger.error(f"Error in stream_rag_response: {e}")
        yield f"data: {json.dumps({'type': 'error', 'content': f'RAG Stream Error: {str(e)}'})}\n\n"
