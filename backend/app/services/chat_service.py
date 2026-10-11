"""
Chat / AI Advice Service
Sends the farmer's question to Llama 3.3 70B on Groq, queries dynamic prices from 
Supabase, and returns a structural market analysis object block.
"""
import json
from app.core.groq_client import get_groq_client
from app.core.supabase_client import get_supabase_client  # ◄ Updated import hook
from app.core.config import settings

async def get_ai_response(
    message: str,
    language: str = "fil",
    location: str = "National Capital Region",
    history: list[dict] | None = None,
) -> dict:
    """
    Generate an agricultural negotiation advice data payload using Llama and Supabase rows.
    """
    client = get_groq_client()

    # Use Llama to structure the spoken information into structured JSON numbers
    extraction_prompt = f"""
    Analyze this message from a Filipino farmer and extract parameters into a valid JSON object only.
    Format requirements: {{"crop": "string", "weight": float, "offer": float}}
    Use English singular form for crop names (e.g., 'Onion', 'Tomato', 'Rice').
    If values are missing, use 0.
    
    Text to evaluate: "{message}"
    """
    
    extraction_response = await client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[{"role": "user", "content": extraction_prompt}],
        response_format={"type": "json_object"}
    )
    
    parsed_json = json.loads(extraction_response.choices[0].message.content)
    crop = parsed_json.get("crop", "Unknown")
    weight = parsed_json.get("weight", 0.0)
    offer = parsed_json.get("offer", 0.0)

    # ◄ Get your active Supabase client singleton instance
    supabase_client = get_supabase_client()

    # Reference dynamic WFP records from Supabase
    db_query = supabase_client.table("market_prices")\
        .select("fair_price_per_kg")\
        .eq("crop_name", crop)\
        .eq("region", location)\
        .execute()
    
    if db_query.data:
        fair_price = float(db_query.data[0]["fair_price_per_kg"])
    else:
        fallback = supabase_client.table("market_prices").select("fair_price_per_kg").eq("crop_name", crop).execute()
        fair_price = float(fallback.data[0]["fair_price_per_kg"]) if fallback.data else 30.0

    total_market_value = fair_price * weight

    # Call Llama 3.3 70B to formulate our conversational bargaining gameplan
    strategy_prompt = f"""
    You are AgriVoice — an expert agricultural economic consultant helping small farmers in the Philippines.
    A farmer in {location} harvested {weight}kg of {crop}. A buyer/middleman offered them ₱{offer} per kg.
    The true dynamic fair market price verified by the UN-WFP is ₱{fair_price} per kg.
    
    Write a concise response in Taglish/Filipino. State clearly if the offer is fair or underpriced.
    Provide a realistic counter-offer goal and give them 2 short, practical conversational dialogue scripts they can say out loud to bargain effectively.
    Keep it conversational, encouraging, and highly actionable.
    """

    messages = [{"role": "user", "content": strategy_prompt}]
    
    strategy_response = await client.chat.completions.create(
        model=settings.GROQ_LLM_MODEL,
        messages=messages,
        max_tokens=512,
        temperature=0.4,
    )

    return {
        "extracted_data": {
            "crop": crop,
            "weight": weight,
            "offer_per_kg": offer
        },
        "fair_price_per_kg": fair_price,
        "total_market_value": total_market_value,
        "strategy": strategy_response.choices[0].message.content.strip()
    }