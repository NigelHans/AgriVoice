"""
Supabase client singleton.
"""
from supabase import create_client, Client
from app.core.config import settings
from app.core.errors import ExternalServiceError

_client: Client | None = None


def get_supabase_client() -> Client:
    global _client
    if _client is None:
        if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
            raise ExternalServiceError("Price database", "SUPABASE_URL / SUPABASE_KEY are not configured")
        _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    return _client
