"""
Chat / AI Advice Service
Handles two kinds of farmer queries:
  * negotiation — crop + buyer offer: compares the offer with WFP prices from
    Supabase and suggests a bargaining strategy
  * advice      — any other agricultural question, answered by Llama 3.3 70B
"""
import json
import logging
from datetime import date
from typing import Literal

import groq
from pydantic import BaseModel, ValidationError, field_validator

from app.core.config import settings
from app.core.errors import ExternalServiceError
from app.core.groq_client import get_groq_client
from app.core.supabase_client import get_supabase_client
from app.schemas.voice import AssistantReply, ExtractedData, PriceStatus
from app.services.market_service import clean_filter_value

logger = logging.getLogger(__name__)

LANGUAGE_NAMES = {
    "fil": "Filipino (Taglish is fine)",
    "ceb": "Cebuano",
    "ilo": "Ilocano",
    "en": "English",
}

MAX_HISTORY_TURNS = 10

EXTRACTION_PROMPT = """You extract structured data from a Filipino farmer's message.
Respond with a JSON object only, using exactly these keys:
  "intent": "negotiation" if the farmer is asking about a price or a buyer's offer for a crop, otherwise "general"
  "crop": English singular crop name (e.g. "Onion", "Tomato", "Rice"), or null if no crop is mentioned
  "weight_kg": total harvest weight in kilograms as a number, or null if not stated
  "offer_per_kg": the buyer's offered price in pesos per kilogram as a number, or null if not stated
Never guess numbers that the farmer did not say."""


class QueryExtraction(BaseModel):
    intent: Literal["negotiation", "general"] = "general"
    crop: str | None = None
    weight_kg: float | None = None
    offer_per_kg: float | None = None

    @field_validator("intent", mode="before")
    @classmethod
    def _normalize_intent(cls, value):
        return "negotiation" if str(value).strip().lower() == "negotiation" else "general"

    @field_validator("crop", mode="before")
    @classmethod
    def _clean_crop(cls, value):
        if not isinstance(value, str):
            return None
        value = clean_filter_value(value)
        return value.title() if value and value.lower() not in {"unknown", "none", "null"} else None

    @field_validator("weight_kg", "offer_per_kg", mode="before")
    @classmethod
    def _positive_number_or_none(cls, value):
        # Missing, zero, negative or non-numeric values all mean "not stated"
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        return number if number > 0 else None


class PriceLookup(BaseModel):
    status: PriceStatus
    price_per_kg: float | None = None
    region: str | None = None
    price_date: date | None = None
    source: str | None = None


def _language_name(language: str) -> str:
    return LANGUAGE_NAMES.get(language, LANGUAGE_NAMES["fil"])


async def _complete(model: str, messages: list[dict], **kwargs) -> str:
    """Call Groq chat completions and return the text, raising ExternalServiceError on failure."""
    try:
        response = await get_groq_client().chat.completions.create(model=model, messages=messages, **kwargs)
    except groq.GroqError as exc:
        raise ExternalServiceError("AI service", str(exc)) from exc

    content = response.choices[0].message.content if response.choices else None
    if not content or not content.strip():
        raise ExternalServiceError("AI service", "empty response")
    return content.strip()


async def extract_query(message: str) -> QueryExtraction:
    """Classify the message and pull out crop / weight / offer. Malformed output → general question."""
    try:
        raw = await _complete(
            settings.GROQ_EXTRACTION_MODEL,
            [
                {"role": "system", "content": EXTRACTION_PROMPT},
                {"role": "user", "content": message},
            ],
            response_format={"type": "json_object"},
            temperature=0,
        )
    except ExternalServiceError as exc:
        # Groq rejects JSON-mode output it cannot parse with a 400; treat that like malformed JSON
        if isinstance(exc.__cause__, groq.BadRequestError):
            logger.warning("Extraction rejected by Groq; treating as a general question: %s", exc)
            return QueryExtraction()
        raise

    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError("extraction is not a JSON object")
        return QueryExtraction.model_validate(data)
    except (ValueError, ValidationError) as exc:
        logger.warning("Malformed extraction output; treating as a general question: %s", exc)
        return QueryExtraction()


def _latest_price(query) -> dict | None:
    result = query.order("price_date", desc=True).limit(1).execute()
    return result.data[0] if result.data else None


def lookup_fair_price(crop: str, location: str) -> PriceLookup:
    """
    Latest price for the crop, never invented. Preference order:
    verified in the farmer's region → verified elsewhere → legacy (unverified) → unavailable.
    """
    try:
        table = get_supabase_client().table("market_prices")
        select = "price_per_kg, region, price_date, source, is_legacy"
        crop_name = clean_filter_value(crop)
        region = clean_filter_value(location)

        # Legacy rows only carry a sync date, so they never outrank verified rows
        attempts = [(legacy, region_filter)
                    for legacy in (False, True)
                    for region_filter in ([region, None] if region else [None])]

        row = None
        for legacy, region_filter in attempts:
            query = table.select(select).ilike("crop_name", crop_name).eq("is_legacy", legacy)
            if region_filter:
                # ilike without wildcards = case-insensitive exact match
                # (WFP spells it "National Capital region")
                query = query.ilike("region", region_filter)
            row = _latest_price(query)
            if row is not None:
                break
    except Exception:
        logger.exception("Price lookup failed for crop=%r location=%r", crop, location)
        return PriceLookup(status="unavailable")

    if row is None or row.get("price_per_kg") is None:
        return PriceLookup(status="unavailable")

    if legacy:
        status = "unverified_legacy"
    else:
        status = "matched_region" if region_filter else "other_region"

    return PriceLookup(
        status=status,
        price_per_kg=float(row["price_per_kg"]),
        region=row.get("region"),
        price_date=None if legacy else row.get("price_date"),   # legacy dates are sync dates
        source=row.get("source"),
    )


def _price_facts(crop: str, location: str, price: PriceLookup) -> str:
    if price.status == "matched_region":
        return (f"The latest recorded retail market price for {crop} in {price.region} "
                f"is ₱{price.price_per_kg:.2f}/kg (as of {price.price_date}, source: {price.source or 'unknown'}).")
    if price.status == "other_region":
        return (f"No price is recorded for {location or 'the farmer’s region'}. The latest recorded retail price "
                f"for {crop} is from {price.region}: ₱{price.price_per_kg:.2f}/kg (as of {price.price_date}, "
                f"source: {price.source or 'unknown'}). Tell the farmer this figure is from another region.")
    if price.status == "unverified_legacy":
        return (f"No verified market price is available. The only figure on record is an older, UNVERIFIED "
                f"price of ₱{price.price_per_kg:.2f}/kg for {crop} in {price.region}; its report date is unknown. "
                f"Mention it only as a rough reference, say clearly that it is unverified, and suggest checking "
                f"the latest DA price monitoring or other buyers before agreeing.")
    return ("No verified market price is available for this crop. Do NOT state or invent a specific market "
            "price. Say that no verified price is available and suggest checking the latest DA price monitoring "
            "or asking other buyers in the area before agreeing.")


async def _negotiation_reply(extraction: QueryExtraction, language: str, location: str) -> AssistantReply:
    crop = extraction.crop
    price = lookup_fair_price(crop, location)

    total = None
    if price.price_per_kg is not None and extraction.weight_kg is not None:
        total = round(price.price_per_kg * extraction.weight_kg, 2)

    weight_text = f"{extraction.weight_kg:g} kg" if extraction.weight_kg else "an unstated amount"
    offer_text = (f"₱{extraction.offer_per_kg:g} per kg" if extraction.offer_per_kg
                  else "a price the farmer did not state")

    prompt = f"""You are AgriVoice, an agricultural economics adviser for small farmers in the Philippines.
A farmer in {location or 'the Philippines'} has {weight_text} of {crop}. A buyer/middleman offered {offer_text}.
{_price_facts(crop, location, price)}
Note: recorded prices are retail; farmgate prices are normally lower, so judge fairness realistically.

Write a concise reply in {_language_name(language)}. If an offer and a verified price are both known, say clearly
whether the offer looks fair or underpriced. Suggest a realistic counter-offer goal only when it can be based on
the figures above, and give 2 short, practical lines the farmer can say out loud to bargain.
Keep it conversational, encouraging, and actionable."""

    strategy = await _complete(
        settings.GROQ_LLM_MODEL,
        [{"role": "user", "content": prompt}],
        max_tokens=512,
        temperature=0.4,
    )

    return AssistantReply(
        mode="negotiation",
        extracted_data=ExtractedData(crop=crop, weight=extraction.weight_kg, offer_per_kg=extraction.offer_per_kg),
        fair_price_per_kg=price.price_per_kg,
        total_market_value=total,
        price_status=price.status,
        price_region=price.region,
        price_date=price.price_date,
        price_source=price.source,
        strategy=strategy,
    )


def _clean_history(history: list[dict] | None) -> list[dict]:
    turns = [
        {"role": turn["role"], "content": turn["content"]}
        for turn in history or []
        if isinstance(turn, dict)
        and turn.get("role") in ("user", "assistant")
        and isinstance(turn.get("content"), str)
        and turn["content"].strip()
    ]
    return turns[-MAX_HISTORY_TURNS:]


async def _advice_reply(
    message: str, extraction: QueryExtraction, language: str, location: str, history: list[dict] | None
) -> AssistantReply:
    system_prompt = f"""You are AgriVoice, a friendly agricultural extension adviser for small farmers in the Philippines.
The farmer is in {location or 'the Philippines'}. Give practical, accurate advice on crops, planting, pests,
soil, weather and farm practices suited to Philippine conditions. Keep answers concise and easy to follow.
If you are not sure, say so and suggest contacting the local Municipal Agriculture Office.
Reply in {_language_name(language)}."""

    answer = await _complete(
        settings.GROQ_LLM_MODEL,
        [{"role": "system", "content": system_prompt}, *_clean_history(history), {"role": "user", "content": message}],
        max_tokens=512,
        temperature=0.4,
    )

    return AssistantReply(
        mode="advice",
        extracted_data=ExtractedData(crop=extraction.crop, weight=extraction.weight_kg, offer_per_kg=extraction.offer_per_kg),
        price_status="not_applicable",
        strategy=answer,
    )


async def get_ai_response(
    message: str,
    language: str = "fil",
    location: str = "National Capital Region",
    history: list[dict] | None = None,
) -> AssistantReply:
    """Answer a farmer's message: negotiation analysis when a crop price/offer is involved, otherwise advice."""
    extraction = await extract_query(message)

    is_negotiation = extraction.crop is not None and (
        extraction.intent == "negotiation" or extraction.offer_per_kg is not None
    )
    if is_negotiation:
        return await _negotiation_reply(extraction, language, location)
    return await _advice_reply(message, extraction, language, location, history)
