"""
Shared fixtures. Groq, Supabase and Open-Meteo are always faked — tests never
need credentials or network access.
"""
import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


class FakeQuery:
    """Chainable stand-in for a postgrest query builder."""

    def __init__(self, table: "FakeTable"):
        self.table = table
        self.filters: list[tuple] = []

    def __getattr__(self, name):
        def record(*args, **kwargs):
            self.filters.append((name, args, kwargs))
            return self
        return record

    def execute(self):
        self.table.executed.append(self.filters)
        if self.table.error:
            raise self.table.error
        return SimpleNamespace(data=self.table.respond(self.filters))


class FakeTable:
    def __init__(self, respond, error=None):
        self.respond = respond
        self.error = error
        self.executed: list[list[tuple]] = []

    def select(self, *args):
        return FakeQuery(self).select(*args)

    def upsert(self, *args, **kwargs):
        return FakeQuery(self).upsert(*args, **kwargs)


class FakeSupabase:
    def __init__(self, respond=lambda filters: [], error=None):
        self.market_prices = FakeTable(respond, error)

    def table(self, name):
        assert name == "market_prices"
        return self.market_prices


class FakeGroq:
    """Returns queued chat replies (str, or an Exception to raise) in call order."""

    def __init__(self, chat_replies=(), transcript="", transcription_error=None):
        self.chat_replies = list(chat_replies)
        self.chat_calls: list[dict] = []
        self.transcription_calls: list[dict] = []
        self._transcript = transcript
        self._transcription_error = transcription_error
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))
        self.audio = SimpleNamespace(transcriptions=SimpleNamespace(create=self._transcribe))

    async def _create(self, **kwargs):
        self.chat_calls.append(kwargs)
        reply = self.chat_replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=reply))])

    async def _transcribe(self, **kwargs):
        self.transcription_calls.append(kwargs)
        if self._transcription_error:
            raise self._transcription_error
        return self._transcript


def extraction(**fields) -> str:
    return json.dumps(fields)


@pytest.fixture(autouse=True)
def no_startup_sync(monkeypatch):
    monkeypatch.setattr(settings, "PRICE_SYNC_ON_STARTUP", False)


@pytest.fixture
def client():
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


@pytest.fixture
def fake_groq(monkeypatch):
    def install(**kwargs) -> FakeGroq:
        fake = FakeGroq(**kwargs)
        monkeypatch.setattr("app.services.chat_service.get_groq_client", lambda: fake)
        monkeypatch.setattr("app.services.transcription_service.get_groq_client", lambda: fake)
        return fake
    return install


@pytest.fixture
def fake_supabase(monkeypatch):
    def install(**kwargs) -> FakeSupabase:
        fake = FakeSupabase(**kwargs)
        for target in ("chat_service", "market_service", "price_sync"):
            monkeypatch.setattr(f"app.services.{target}.get_supabase_client", lambda: fake)
        return fake
    return install
