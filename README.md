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
- Node.js 22.13+ (or 24.3+) and npm
- Python 3.12+
- Expo Go app on your phone, the current version from the Play Store or App Store (the app uses Expo SDK 58; no global Expo CLI needed)
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

### 3. Put the backend online (Render, optional)
With a hosted backend the app works on any network, without your computer running.

1. On https://render.com, sign up with GitHub (the free plan needs no card).
2. **New → Blueprint**, pick this repository. Render reads `render.yaml` and creates `agrivoice-backend`.
3. When asked, fill in `GROQ_API_KEY`, `SUPABASE_URL` and `SUPABASE_KEY` (the **service_role** key, same as `backend/.env`). Never commit them.
4. Wait for the deploy to finish, then open `https://<your-service>.onrender.com/docs` to check it.
5. In `mobile/.env`, set `EXPO_PUBLIC_BACKEND_URL=https://<your-service>.onrender.com` and restart Expo with `npx expo start -c`.

Every merge to `main` redeploys automatically. The free plan sleeps after 15 minutes without requests; the app pings the backend when it opens, but the first answer after a quiet spell can still take about a minute.

### 4. Build the installable Android app (APK)
Testers can install the APK like any app: no Expo Go, no laptop, any network. It talks to the hosted backend.

```bash
cd mobile
npx eas-cli login                       # once, with the Expo account that owns the project
npx eas-cli build --platform android --profile preview
```
The build runs on Expo's servers (about 10-20 minutes on the free plan) and ends with a download link and QR code. On the phone, open the link, download the APK and allow "Install unknown apps" when Android asks.

- The backend URL is set in `mobile/eas.json`. The app key is the `EXPO_PUBLIC_APP_KEY` variable in the EAS **preview** environment (`npx eas-cli env:list --environment preview`), never in the repo.
- Rebuild after changing app code. Backend changes need no rebuild.

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
