"""
Shared exception for failures in external services (Groq, Supabase, Open-Meteo).
Converted to an HTTP 502 response by the handler registered in app.main.
"""


class ExternalServiceError(Exception):
    def __init__(self, service: str, detail: str):
        super().__init__(f"{service}: {detail}")
        self.service = service
        self.detail = detail
