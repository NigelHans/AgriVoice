# AgriVoice

A voice-powered mobile assistant for Filipino farmers, providing real-time crop advice, market prices, and weather forecasts in multiple regional languages (Filipino, Cebuano, Ilocano, and more).

---

## Tech Stack

| Layer         | Technology               | Purpose                                              |
|---------------|--------------------------|------------------------------------------------------|
| **Mobile App**    | React Native + Expo      | Cross-platform mobile UI with microphone access      |
| **AI Engine** | Groq API                 | Whisper-Large-v3 (STT) + GPT-OSS 120B/20B (LLM)    |
| **Backend**   | Python + FastAPI         | Audio upload handling, Groq orchestration, price sync|
| **Database**  | Supabase (PostgreSQL)    | Market prices, crop data, user history               |

---

## Project Structure

```
AgriVoice/
├── backend/
├── docs/
├── mobile/
└── README.md
```

---

## Getting Started

### Prerequisites
- Node.js 18+ and npm/yarn
- Python 3.12+
- Expo Go app on your phone (no global Expo CLI needed; `npx expo` is used)
- Groq API key (https://console.groq.com)
- Supabase project (https://supabase.com)

### 1. Backend (FastAPI)
```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
source venv/bin/activate     # macOS / Linux
pip install -r requirements-dev.txt
cp .env.example .env         # Windows: copy .env.example .env
```

Fill in `backend/.env`:
- `GROQ_API_KEY`: your key from https://console.groq.com
- `SUPABASE_URL`, `SUPABASE_KEY`: get the team's values privately (never commit them). Use the **service_role** key: `market_prices` is read-only for `anon`, so the price sync cannot write with the anon key.
- Optional: `PRICE_SYNC_ON_STARTUP=false` stops the server from writing prices to Supabase on every start.

```bash
python run.py                # same as: uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
Check that it is running at http://localhost:8000/docs.

Run the backend tests (Groq, Supabase and Open-Meteo are mocked, so no credentials are needed):
```bash
python -m pytest
```

### 2. Mobile App (Expo)
In a second terminal:
```bash
cd mobile
npm install
cp .env.example .env         # Windows: copy .env.example .env
```

In `mobile/.env`, set `EXPO_PUBLIC_BACKEND_URL=http://<your-LAN-IP>:8000`, using **your own** computer's IP (`ipconfig` on Windows, `ip addr` or `ifconfig` on macOS/Linux). For UI-only work, `EXPO_PUBLIC_USE_MOCKS=true` shows sample data without the backend.

```bash
npx expo start
```
Scan the QR code with the **Expo Go** app on your phone.

### Troubleshooting
- **Phone can't reach the backend:** the phone and computer must be on the same Wi-Fi, the firewall must allow port 8000, and the backend must run with `--host 0.0.0.0`.
- **`.env` changes ignored:** restart Expo with `npx expo start -c`.
- **Prices return 502:** the database migrations have not been applied yet. See `backend/database/migrations/001_rollback_and_recovery.md`.

---

## Features
- 🎤 Voice recording with one-tap capture
- 🗣️ Speech-to-text via Groq Whisper (multi-language)
- 🤖 AI crop/market advice via GPT-OSS 120B
- 📈 Daily market price tracking
- 🌤️ Weather integration
- 🌏 Multi-language support (Filipino, Cebuano, Ilocano, English)
