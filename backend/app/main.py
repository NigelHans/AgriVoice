"""
AgriVoice — FastAPI Application Factory
"""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.errors import ExternalServiceError
from app.core.security import require_app_key
from app.api.v1 import voice, chat, market, weather
from app.services.price_sync import run_price_sync

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan — syncs WFP market prices in a background thread so the server
# starts accepting requests immediately
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    if not settings.APP_API_KEY:
        logger.warning("APP_API_KEY is not set: voice and chat are open to anyone who can reach this server")
    if settings.PRICE_SYNC_ON_STARTUP:
        app.state.price_sync_task = asyncio.create_task(asyncio.to_thread(run_price_sync))
    yield


# ---------------------------------------------------------------------------
# FastAPI Application Initialization
# ---------------------------------------------------------------------------
app = FastAPI(
    title="AgriVoice API",
    description="Voice-powered agricultural assistant for Filipino farmers.",
    version="1.0.0",
    lifespan=lifespan, # Hooks up our dynamic boot pipeline
)

# ---------------------------------------------------------------------------
# CORS — allows the Expo mobile app to reach this server
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # tighten this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Errors — upstream failures become 502 instead of an opaque 500
# ---------------------------------------------------------------------------
@app.exception_handler(ExternalServiceError)
async def external_service_error_handler(request: Request, exc: ExternalServiceError):
    logger.error("External service failure on %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=502,
        content={"detail": f"{exc.service} is unavailable right now. Please try again."},
    )

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
# Voice and chat spend Groq quota, so they need the app key (when configured); prices and weather stay open
app.include_router(voice.router,   prefix="/api/v1/voice",   tags=["Voice"], dependencies=[Depends(require_app_key)])
app.include_router(chat.router,    prefix="/api/v1/chat",    tags=["Chat"],  dependencies=[Depends(require_app_key)])
app.include_router(market.router,  prefix="/api/v1/market",  tags=["Market"])
app.include_router(weather.router, prefix="/api/v1/weather", tags=["Weather"])


@app.get("/", tags=["Health"])
async def root():
    return {"status": "ok", "message": "AgriVoice API is running 🌾"}


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "healthy"}