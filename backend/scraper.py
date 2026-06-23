import pandas as pd
from app.core.supabase_client import get_supabase_client  # ◄ Updated import hook

WFP_CSV_URL = "https://data.humdata.org/dataset/wfp-food-prices-for-philippines/resource/9a842d72-0d7d-4922-ad0e-eb8106c1ab0e/download/wfp_food_prices_phl.csv"

CROP_MAPPING = {
    "Onions (red)": "Onion",
    "Tomatoes": "Tomato",
    "Rice (regular milled)": "Rice"
}

def run_price_sync():
    print("🔄 Fetching live regional market dataset...")
    try:
        df = pd.read_csv(WFP_CSV_URL, skiprows=[1])
        df_filtered = df[df['commodity'].isin(CROP_MAPPING.keys())].copy()
        df_filtered = df_filtered.sort_values(by='date', ascending=False)
        
        # ◄ Get your active Supabase client singleton instance
        supabase_client = get_supabase_client()
        
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
                supabase_client.table("market_prices").upsert(data_payload).execute()
                updated_pairs.add(tracking_key)
                print(f"   ✅ Saved {clean_crop} in {region}: ₱{price}/kg")
                
        print("🎉 Dynamic Market Price Sync Complete!")
    except Exception as e:
        print(f"⚠️ Failed to sync market data: {e}")

if __name__ == "__main__":
    run_price_sync()