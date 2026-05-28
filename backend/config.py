import os
from pydantic_settings import BaseSettings

# Resolve path to the .env file in the root project directory (one level above config.py)
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_file_path = os.path.join(root_dir, ".env")

class Settings(BaseSettings):
    GROQ_API_KEY: str = ""
    CHROMA_PERSIST_DIRECTORY: str = "data/chroma"
    LLM_MODEL: str = "llama-3.3-70b-versatile"
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    PORT: int = 8000
    HOST: str = "127.0.0.1"

    class Config:
        env_file = env_file_path
        env_file_encoding = "utf-8"
        extra = "ignore"

settings = Settings()
