"""App key: voice/chat need X-App-Key when APP_API_KEY is set; prices and health stay open."""
import pytest

from app.core.config import settings
from tests.conftest import extraction


@pytest.fixture
def key_required(monkeypatch):
    monkeypatch.setattr(settings, "APP_API_KEY", "test-key")


def test_chat_without_or_with_wrong_key_is_rejected(client, fake_groq, key_required):
    groq_fake = fake_groq()
    assert client.post("/api/v1/chat/ask", json={"message": "Hi"}).status_code == 401
    assert client.post("/api/v1/chat/ask", json={"message": "Hi"}, headers={"X-App-Key": "nope"}).status_code == 401
    assert client.post("/api/v1/chat/translate", json={"text": "Hi", "language": "en"}).status_code == 401
    assert client.post("/api/v1/voice/transcribe", files={"audio": ("a.m4a", b"x", "audio/mp4")}).status_code == 401
    assert groq_fake.chat_calls == [] and groq_fake.transcription_calls == []


def test_chat_with_right_key_works(client, fake_groq, fake_supabase, key_required):
    fake_groq(chat_replies=[extraction(intent="general"), "Use compost."])
    fake_supabase()
    response = client.post("/api/v1/chat/ask", json={"message": "Soil tips?"}, headers={"X-App-Key": "test-key"})
    assert response.status_code == 200


def test_prices_and_health_stay_open(client, fake_supabase, key_required):
    fake_supabase()
    assert client.get("/health").status_code == 200
    assert client.get("/api/v1/market/prices").status_code == 200
