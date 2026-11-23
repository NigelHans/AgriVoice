"""
Application configuration — loads from .env file.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # ◄ ADD THIS LINE HERE to catch the value from your .env file
    CORS_ORIGINS: str = "*"

    # Groq
    GROQ_API_KEY: str = ""
    GROQ_STT_MODEL: str = "whisper-large-v3"
    # The Llama models were retired on Groq (404 model_not_found, 2026-11-05)
    GROQ_LLM_MODEL: str = "openai/gpt-oss-120b"
    GROQ_EXTRACTION_MODEL: str = "openai/gpt-oss-20b"

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""

    # Pull the latest WFP prices into Supabase in the background on startup
    PRICE_SYNC_ON_STARTUP: bool = True

    # Server
    BACKEND_HOST: str = "0.0.0.0"
    BACKEND_PORT: int = 8000

    # Supported languages
    SUPPORTED_LANGUAGES: list[str] = ["fil", "ceb", "ilo", "en"]


settings = Settings()