import os
import sys
import logging

# Ensure root of project is in sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.scraper import scrape_video_data
from services.vector_store import add_video_transcript, similarity_search, reset_vector_store
from services.rag_chain import stream_rag_response

# Configure logs
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("RAGTestRunner")

def run_test():
    logger.info("=== STARTING AUTOMATED RAG PIPELINE TEST ===")
    
    # 1. Clear database
    reset_vector_store()
    
    # 2. Test Scraping (YouTube and Instagram mock fallback validation)
    youtube_url = "https://www.youtube.com/watch?v=w7ejDZ8dBn8"
    instagram_url = "https://www.instagram.com/reel/C8P4n7uR3W4/"
    
    logger.info(f"Ingesting Video A (YouTube): {youtube_url}")
    video_a_data = scrape_video_data(youtube_url)
    video_a_data["video_id"] = "A"
    logger.info(f"Video A title: '{video_a_data['title']}' | Creator: @{video_a_data['creator']}")
    logger.info(f"Video A views: {video_a_data['views']} | Engagement: {video_a_data['engagement_rate']}%")
    
    logger.info(f"Ingesting Video B (Instagram): {instagram_url}")
    video_b_data = scrape_video_data(instagram_url)
    video_b_data["video_id"] = "B"
    logger.info(f"Video B title: '{video_b_data['title']}' | Creator: @{video_b_data['creator']}")
    logger.info(f"Video B views: {video_b_data['views']} | Engagement: {video_b_data['engagement_rate']}%")
    
    # 3. Add to ChromaDB and check chunk sizes
    logger.info("Indexing Video A in ChromaDB...")
    add_video_transcript("A", video_a_data["transcript"], video_a_data)
    
    logger.info("Indexing Video B in ChromaDB...")
    add_video_transcript("B", video_b_data["transcript"], video_b_data)
    
    # 4. Perform vector similarity search
    query = "Compare the hook in the first 5 seconds"
    logger.info(f"Searching ChromaDB for: '{query}'")
    results = similarity_search(query, k=2)
    logger.info(f"Found {len(results)} matching chunks.")
    for i, doc in enumerate(results):
        logger.info(f"Match {i+1} [Video {doc.metadata.get('video_id')}]: {doc.page_content[:100]}...")
        
    # 5. Stream LLM response
    logger.info("Triggering streamed RAG generation...")
    generator = stream_rag_response(
        query=query,
        history=[],
        video_a_meta=video_a_data,
        video_b_meta=video_b_data
    )
    
    logger.info("=== STREAMED TOKENS ===")
    for chunk in generator:
        if chunk.startswith("data: "):
            try:
                import json
                data = json.loads(chunk[6:])
                if data.type == "token":
                    sys.stdout.write(data.content)
                    sys.stdout.flush()
                elif data.type == "citations":
                    logger.info(f"\n[Retrieved {len(data.content)} Citations]")
            except Exception as e:
                pass
    logger.info("\n\n=== PIPELINE TEST COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    run_test()
