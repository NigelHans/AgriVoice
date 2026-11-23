"""
Manual WFP market price sync.
Usage (from backend/):  python scraper.py
"""
import logging

from app.services.price_sync import run_price_sync

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    count = run_price_sync()
    print(f"Upserted {count} market price rows.")
