"""
AgriVoice — FastAPI Application Factory
"""
from contextlib import asynccontextmanager
import pandas as pd
from supabase import create_client, Client
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.v1 import voice, chat, market, weather

# ---------------------------------------------------------------------------
# Background Lifespan Task — Syncs dynamic market data on startup
# ---------------------------------------------------------------------------
def run_price_sync():
    """
    Fetches the latest UN-WFP food price data for the Philippines
    and updates the dynamic Supabase market tables.
    """
    print("🔄 [Startup] Fetching live regional market dataset...")
    
    WFP_CSV_URL = "https://data.humdata.org/dataset/wfp-food-prices-for-philippines/resource/9a842d72-0d7d-4922-ad0e-eb8106c1ab0e/download/wfp_food_prices_phl.csv"
    
    CROP_MAPPING = {
        "Onions (red)": "Onion",
        "Tomatoes": "Tomato",
        "Rice (regular, milled)": "Rice",
        "Rice (well milled)": "Rice",
        "Rice (special)": "Rice",
        "Rice (milled, superior)": "Rice",
        "Rice (paddy)": "Rice",
        "Rice (premium)": "Rice"
    }
    
    try:
        # Initialize Supabase inside the task using your settings file parameters
        supabase_client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        
        # Read data directly from HDX, skipping the 2nd system-metadata row index
        df = pd.read_csv(WFP_CSV_URL, skiprows=[1])
        df_filtered = df[df['commodity'].isin(CROP_MAPPING.keys())].copy()
        df_filtered = df_filtered.sort_values(by='date', ascending=False)
        
        updated_pairs = set()
        
        for _, row in df_filtered.iterrows():
            raw_crop = row['commodity']
            clean_crop = CROP_MAPPING[raw_crop]
            region = row['admin1']     
            province = row['admin2']   
            price = float(row['price'])
            
            tracking_key = f"{clean_crop}-{region}"
            
            if tracking_key not in updated_pairs:
                data_payload = {
                    "crop_name": clean_crop,
                    "region": region,
                    "province": province,
                    "fair_price_per_kg": price,
                    "updated_at": "now()"
                }
                # Upsert updates the row if the unique constraint matches, preventing duplication
                supabase_client.table("market_prices").upsert(
    data_payload,
    on_conflict="crop_name,region"
).execute()
                updated_pairs.add(tracking_key)
                
        print("🎉 [Startup] Dynamic Market Price Sync Complete!")
    except Exception as e:
        print(f"⚠️ [Startup Warning] Failed to sync market data on boot: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # This runs immediately when your Render server instances boot up
    run_price_sync()
    yield
    # Any teardown/shutdown logic would go here if needed


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
# Routers
# ---------------------------------------------------------------------------
app.include_router(voice.router,   prefix="/api/v1/voice",   tags=["Voice"])
app.include_router(chat.router,    prefix="/api/v1/chat",    tags=["Chat"])
app.include_router(market.router,  prefix="/api/v1/market",  tags=["Market"])
app.include_router(weather.router, prefix="/api/v1/weather", tags=["Weather"])


@app.get("/", tags=["Health"])
async def root():
    return {"status": "ok", "message": "AgriVoice API is running 🌾"}


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "healthy"}