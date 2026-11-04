# AgriVoice

A voice-powered mobile assistant for Filipino farmers, providing real-time crop advice, market prices, and weather forecasts in multiple regional languages (Filipino, Cebuano, Ilocano, and more).

---

## Tech Stack

| Layer         | Technology               | Purpose                                              |
|---------------|--------------------------|------------------------------------------------------|
| **Mobile App**    | React Native + Expo      | Cross-platform mobile UI with microphone access      |
| **AI Engine** | Groq API                 | Whisper-Large-v3 (STT) + Llama 3.3 70B (LLM)       |
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
- Python 3.14+
- Expo CLI (`npm install -g expo-cli`)
- Groq API key (https://console.groq.com)
- Supabase project (https://supabase.com)

### Mobile App (Expo)
```bash
cd mobile
npm install
npx expo start
```
Scan the QR code with the **Expo Go** app on your phone.

### Backend (FastAPI)
```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
source venv/bin/activate     # macOS / Linux
pip install -r requirements.txt
cp .env.example .env         # then fill in GROQ_API_KEY, SUPABASE_URL, SUPABASE_KEY
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Run the backend tests (Groq, Supabase and Open-Meteo are mocked — no credentials needed):
```bash
pip install -r requirements-dev.txt
python -m pytest
```

For the mobile app, copy `mobile/.env.example` to `mobile/.env` and set `EXPO_PUBLIC_BACKEND_URL` to your computer's LAN IP.

---

## Features
- 🎤 Voice recording with one-tap capture
- 🗣️ Speech-to-text via Groq Whisper (multi-language)
- 🤖 AI crop/market advice via Llama 3.3 70B
- 📈 Daily market price tracking
- 🌤️ Weather integration
- 🌏 Multi-language support (Filipino, Cebuano, Ilocano, English)
