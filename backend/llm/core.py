from groq import Groq
from langchain_groq import ChatGroq
from config import settings

def get_groq_client() -> Groq:
    """Returns the native Groq client for tasks like Audio Transcription."""
    api_key = settings.GROQ_API_KEY
    if not api_key:
        raise ValueError("No GROQ_API_KEY found in environment or config.")
    return Groq(api_key=api_key)

def get_chat_llm() -> ChatGroq:
    """Returns the LangChain ChatGroq instance for conversational RAG."""
    api_key = settings.GROQ_API_KEY
    if not api_key:
        raise ValueError("No GROQ_API_KEY found in environment or config.")
        
    return ChatGroq(
        groq_api_key=api_key,
        model_name=settings.LLM_MODEL,
        temperature=0.3,
        streaming=True
    )
