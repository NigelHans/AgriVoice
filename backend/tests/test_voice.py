"""/api/v1/voice/transcribe — full voice pipeline with mocked Groq/Supabase."""
import groq
import httpx

from tests.conftest import extraction

AUDIO = {"audio": ("recording.m4a", b"fake-audio", "audio/mp4")}


def test_voice_negotiation_happy_path(client, fake_groq, fake_supabase):
    fake_groq(
        transcript="  100 kilo sibuyas, 60 piso ang alok  ",
        chat_replies=[extraction(intent="negotiation", crop="Onion", weight_kg=100, offer_per_kg=60), "Tawaran mo ng 90."],
    )
    fake_supabase(respond=lambda filters: [{"price_per_kg": 120, "region": "National Capital region",
                                            "price_date": "2026-08-15", "source": "UN-WFP (retail)"}])

    response = client.post("/api/v1/voice/transcribe", files=AUDIO, data={"language": "fil"})

    assert response.status_code == 200
    body = response.json()
    assert body["transcript"] == "100 kilo sibuyas, 60 piso ang alok"
    assert body["reply"]["strategy"] == "Tawaran mo ng 90."
    assert body["reply"]["total_market_value"] == 12000.0


def test_voice_missing_weight_and_offer_does_not_crash(client, fake_groq, fake_supabase):
    # Previously: TypeError (float * None) → HTTP 500
    fake_groq(transcript="Magkano ang sibuyas?",
              chat_replies=[extraction(intent="negotiation", crop="Onion", weight_kg=None, offer_per_kg=None), "ok"])
    fake_supabase(respond=lambda filters: [{"price_per_kg": 120, "region": "Region I", "price_date": "2026-08-15", "source": "x"}])

    response = client.post("/api/v1/voice/transcribe", files=AUDIO)

    assert response.status_code == 200
    reply = response.json()["reply"]
    assert reply["extracted_data"]["weight"] is None
    assert reply["extracted_data"]["offer_per_kg"] is None
    assert reply["fair_price_per_kg"] == 120.0
    assert reply["total_market_value"] is None


def test_voice_general_question(client, fake_groq, fake_supabase):
    fake_groq(transcript="Paano labanan ang peste sa palay?",
              chat_replies=[extraction(intent="general", crop="Rice"), "Gumamit ng IPM."])
    fake_supabase()

    reply = client.post("/api/v1/voice/transcribe", files=AUDIO).json()["reply"]

    assert reply["mode"] == "advice"
    assert reply["strategy"] == "Gumamit ng IPM."


def test_cebuano_uses_whisper_auto_detect(client, fake_groq, fake_supabase):
    groq_fake = fake_groq(transcript="Unsa ang presyo?", chat_replies=[extraction(intent="general"), "ok"])
    fake_supabase()

    client.post("/api/v1/voice/transcribe", files=AUDIO, data={"language": "ceb"})

    assert "language" not in groq_fake.transcription_calls[0]


def test_filipino_sends_tagalog_language_code(client, fake_groq, fake_supabase):
    groq_fake = fake_groq(transcript="Kumusta", chat_replies=[extraction(intent="general"), "ok"])
    fake_supabase()

    client.post("/api/v1/voice/transcribe", files=AUDIO, data={"language": "fil"})

    assert groq_fake.transcription_calls[0]["language"] == "tl"


def test_empty_audio_is_rejected(client):
    response = client.post("/api/v1/voice/transcribe", files={"audio": ("a.m4a", b"", "audio/mp4")})
    assert response.status_code == 400


def test_blank_transcript_returns_422(client, fake_groq):
    fake_groq(transcript="   ")
    response = client.post("/api/v1/voice/transcribe", files=AUDIO)
    assert response.status_code == 422


def test_transcription_failure_returns_502(client, fake_groq):
    fake_groq(transcription_error=groq.APIConnectionError(request=httpx.Request("POST", "https://api.groq.com")))
    response = client.post("/api/v1/voice/transcribe", files=AUDIO)
    assert response.status_code == 502
    assert "Speech recognition" in response.json()["detail"]
