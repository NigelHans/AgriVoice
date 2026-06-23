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
    GROQ_LLM_MODEL: str = "llama-3.3-70b-versatile"

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""

    # Server
    BACKEND_HOST: str = "0.0.0.0"
    BACKEND_PORT: int = 8000

    # Supported languages
    SUPPORTED_LANGUAGES: list[str] = ["fil", "ceb", "ilo", "en"]


settings = Settings()