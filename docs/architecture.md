# AgriVoice — Architecture Notes

## System Architecture

```
                        ┌─────────────────────────────────────────┐
                        │           FARMER'S PHONE                │
                        │  ┌─────────────────────────────────┐    │
                        │  │    Expo React Native App         │    │
                        │  │  • Voice Screen (Mic button)     │    │
                        │  │  • Market Prices Screen          │    │
                        │  │  • Weather Screen                │    │
                        │  │  • History Screen                │    │
                        │  └────────────┬────────────────────┘    │
                        └───────────────┼─────────────────────────┘
                                        │ HTTP (local WiFi or mobile data)
                                        ▼
                        ┌─────────────────────────────────────────┐
                        │         FastAPI Backend (Python)        │
                        │                                         │
                        │  POST /api/v1/voice/transcribe          │
                        │    └─► Groq Whisper-Large-v3 (STT)     │
                        │    └─► Groq Llama 3.3 70B (LLM)       │
                        │                                         │
                        │  GET  /api/v1/market/prices             │
                        │    └─► Supabase PostgreSQL             │
                        │                                         │
                        │  GET  /api/v1/weather/forecast          │
                        │    └─► Open-Meteo API (free)           │
                        └─────────────────────────────────────────┘
```

## Data Flow — Voice Query

1. Farmer taps microphone → `expo-av` records audio as `.m4a`
2. App sends `multipart/form-data` POST to `/api/v1/voice/transcribe`
3. FastAPI receives audio bytes → streams to **Groq Whisper-Large-v3**
4. Whisper returns transcript text
5. FastAPI passes transcript to **Groq Llama 3.3 70B** with agricultural system prompt
6. LLM returns advice in farmer's language
7. JSON response `{ transcript, reply }` sent back to phone
8. App displays transcript + reply, saves to AsyncStorage history

## Supabase Tables

| Table             | Purpose                                         |
|-------------------|-------------------------------------------------|
| `market_prices`   | Daily crop prices synced from DA/BAI data       |
| `conversations`   | Session records keyed by anonymous device ID    |
| `messages`        | Individual turns (transcript + AI reply)        |
| `crops_reference` | Static crop data with multilingual names        |

## Groq Models Used

| Task              | Model                    | Why                                          |
|-------------------|--------------------------|----------------------------------------------|
| Speech-to-Text    | `whisper-large-v3`       | Best OSS multilingual STT, free on Groq      |
| AI Crop Advice    | `llama-3.3-70b-versatile`| Best OSS 70B chat model, fast on Groq        |

## Supported Languages

| Code  | Language    | Whisper Code |
|-------|-------------|--------------|
| `fil` | Filipino    | `tl`         |
| `ceb` | Cebuano     | `ceb`        |
| `ilo` | Ilocano     | auto-detect  |
| `en`  | English     | `en`         |
