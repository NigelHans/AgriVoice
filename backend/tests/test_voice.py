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


def test_transcription_gets_vocabulary_prompt_in_selected_language(client, fake_groq, fake_supabase):
    from app.services.transcription_service import VOCABULARY_PROMPT
    groq_fake = fake_groq(chat_replies=[extraction(intent="general"), "Ok"], transcript="Pila ang humay?")
    fake_supabase()
    client.post("/api/v1/voice/transcribe", files={"audio": ("a.m4a", b"audio", "audio/mp4")}, data={"language": "ceb"})
    assert groq_fake.transcription_calls[0]["prompt"] == VOCABULARY_PROMPT["ceb"]


def test_low_confidence_transcript_asks_for_confirmation_without_ai_call(client, fake_groq, fake_supabase):
    from types import SimpleNamespace
    groq_fake = fake_groq(transcript=SimpleNamespace(
        text=" Magkano ang si buyas? ", segments=[{"avg_logprob": -1.4, "no_speech_prob": 0.1}]))
    fake_supabase()

    response = client.post("/api/v1/voice/transcribe", files=AUDIO, data={"language": "fil"})

    assert response.status_code == 200
    assert response.json() == {"transcript": "Magkano ang si buyas?", "reply": None, "needs_confirmation": True}
    assert groq_fake.chat_calls == []


def test_confident_transcript_is_answered(client, fake_groq, fake_supabase):
    from types import SimpleNamespace
    groq_fake = fake_groq(
        transcript=SimpleNamespace(text="Kailan magtanim?", segments=[{"avg_logprob": -0.3, "no_speech_prob": 0.05}]),
        chat_replies=[extraction(intent="general"), "Sa tag-ulan."],
    )
    fake_supabase()

    body = client.post("/api/v1/voice/transcribe", files=AUDIO, data={"language": "fil"}).json()

    assert body["needs_confirmation"] is False
    assert body["reply"]["strategy"] == "Sa tag-ulan."
    assert groq_fake.transcription_calls[0]["response_format"] == "verbose_json"


def test_punctuation_only_transcript_counts_as_not_understood(client, fake_groq, fake_supabase):
    groq_fake = fake_groq(transcript=" . ")
    fake_supabase()
    response = client.post("/api/v1/voice/transcribe", files=AUDIO, data={"language": "ceb"})
    assert response.status_code == 422
    assert groq_fake.chat_calls == []


def test_whisper_silence_phrases_count_as_not_understood(client, fake_groq, fake_supabase):
    for phrase in [" Thank you for watching! ", "Thank you.", "Salamat sa panonood."]:
        groq_fake = fake_groq(transcript=phrase)
        fake_supabase()
        assert client.post("/api/v1/voice/transcribe", files=AUDIO, data={"language": "fil"}).status_code == 422, phrase
        assert groq_fake.chat_calls == []


def test_real_question_with_thank_you_is_kept(client, fake_groq, fake_supabase):
    fake_groq(transcript="Thank you, how much is onion today?", chat_replies=[extraction(intent="general"), "ok"])
    fake_supabase()
    assert client.post("/api/v1/voice/transcribe", files=AUDIO, data={"language": "en"}).status_code == 200
