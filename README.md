# 🌾 AgriVoice

A voice-powered mobile assistant for Filipino farmers — providing real-time crop advice, market prices, and weather forecasts in multiple regional languages (Filipino, Cebuano, Ilocano, and more).

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
├── mobile/          # Expo React Native app
├── backend/         # FastAPI Python server
├── docs/            # Documentation, research, API specs
└── README.md
```

---

## Getting Started

### Prerequisites
- Node.js 18+ and npm/yarn
- Python 3.11+
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
pip install -r requirements.txt
uvicorn app.main:app --reload
```

---

## Environment Variables

### Backend (`backend/.env`)
```
GROQ_API_KEY=your_groq_api_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_anon_key
BACKEND_PORT=8000
```

### Mobile (`mobile/.env`)
```
EXPO_PUBLIC_BACKEND_URL=http://your-local-ip:8000
```

---

## Features
- 🎤 Voice recording with one-tap capture
- 🗣️ Speech-to-text via Groq Whisper (multi-language)
- 🤖 AI crop/market advice via Llama 3.3 70B
- 📈 Daily market price tracking
- 🌤️ Weather integration
- 🌏 Multi-language support (Filipino, Cebuano, Ilocano, English)
