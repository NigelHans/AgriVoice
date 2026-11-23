"""
App key check for the endpoints that spend Groq quota (voice, chat).
Enabled only when APP_API_KEY is set (the hosted backend); local dev and tests stay open.
shortcut: one shared key, embedded in the app, so it stops casual misuse, not a determined user
who extracts it from the APK; add per-IP rate limiting before a wide public release.
"""
import hmac

from fastapi import Header, HTTPException

from app.core.config import settings


async def require_app_key(x_app_key: str | None = Header(default=None)) -> None:
    if settings.APP_API_KEY and not hmac.compare_digest(x_app_key or "", settings.APP_API_KEY):
        raise HTTPException(status_code=401, detail="Missing or invalid app key.")
