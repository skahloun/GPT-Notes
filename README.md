# Class Notes PWA

Browser-based, real-time class note-taking Progressive Web App with:
- **Live transcription** via AWS Transcribe (enhanced diarization settings)
- **Structured academic notes** via OpenAI
- **Google Docs export** to a per-user *Class Notes* folder
- **Index & search** by class title and date
- **PWA** installable on iOS/Android/desktop (offline caching of shell)

> **Stack:** Node.js + TypeScript (Express, ws), Vanilla JS frontend, Google APIs, AWS Transcribe, OpenAI

## Features

- Record audio from the browser (MediaStream + ScriptProcessor) and stream **16kHz PCM mono** over WebSocket.
- Real-time partial/final transcript rendering with speaker labels and warnings.
- Post-recording: GPT-4 class notes with sections (Intro, Key Concepts, Explanations, Definitions, Summary, Exam Questions).
- Save notes to **Google Docs** titled `{class} Notes - {YYYY-MM-DD}` under a *Class Notes* folder.
- Sessions saved in **SQLite**, visible in the dashboard.
- Basic JWT auth + demo tiers (free/premium).

## Project Layout

```
class-notes-pwa/
  public/
    index.html
    main.js
    manifest.json
    service-worker.js
    icons/
  src/
    app.ts
    models/class-session.model.ts
    services/
      aws-transcribe.service.ts
      assemblyai.service.ts
      ai-analyzer.ts
      google-docs.service.ts
    utils/export-utils.ts
  package.json
  tsconfig.json
  .env.example
  README.md
```

## Quick Start (Local)

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with AWS, OpenAI, and Google OAuth credentials
   ```

3. **Run in dev**
   ```bash
   npm run dev
   ```

4. Open **http://localhost:3000**

5. **Register + Login** (demo auth), enter a class title, then **Start Recording**.

6. **Connect Google**:
   - Click **Connect Google** (redirect). After Google's consent screen you’ll see a message.
   - Grab the tokens from the server logs or enhance the `/auth/google/callback` flow to bind tokens to the current JWT user via `state`.
   - POST the tokens to `/api/save-google-tokens` with `Authorization: Bearer <JWT>`.

> **Safari/iOS note:** iOS Safari allows microphone with user gesture. Add to Home Screen to run as a PWA. HTTPS is required in production; localhost is OK for testing.

## AWS Transcribe – Enhanced Diarization

This demo enables speaker labels and sets a min/max speaker range (2–5). Improve results by:
- **Custom vocabulary**: set `AWS_TRANSCRIBE_VOCAB_NAME` with your academic terms.
- **Custom language model**: set `AWS_TRANSCRIBE_LANGUAGE_MODEL` to a trained model name.
- **Mic tips**: use external mics, front-row placement, and avoid covering the mic on phones.

### Overlapping Speech (Advanced)

This repo ships with AWS first. For robust overlap diarization:
- Optionally integrate **AssemblyAI** (`ASSEMBLYAI_API_KEY`, `USE_ASSEMBLYAI_FALLBACK=true`).
- Consider a separate Python microservice for overlap detection (EEND-VC / SA-EEND); feed overlap segments back into an ensemble (e.g., DOVER-Lap voting). Hook where `ai-analyzer.ts` runs to reconcile labels.

## OpenAI Notes Generation

We call OpenAI (`gpt-4o-mini` by default) to return **JSON** with a refined transcript and notes sections. Adjust the model in `src/services/ai-analyzer.ts`.

## Google Docs Export

- OAuth 2.0 web app creds needed. Configure **Authorized redirect URI** to `http://localhost:3000/auth/google/callback` (or your prod URL).
- We create/ensure a *Class Notes* folder and insert styled text (basic headings via plain text here; you can expand to Docs structural elements).

## Monetization Hooks

- Basic JWT auth with a `tier` field (`free`/`premium`).
- Add limits by checking `req.user.tier` in `/ws/audio` init (e.g., session length, daily minutes).
- Add Stripe or your provider for subscriptions; on success, flip `tier` to `premium` in DB.

## PWA on iPhone

- `manifest.json` and `service-worker.js` included.
- In Safari, open the URL and **Add to Home Screen**.
- Test audio capture. iOS requires user gesture to start recording.

## Error Handling

- Microphone permission / device errors surface in the UI status area.
- AWS/Google/OpenAI failures show warnings; we still persist transcript locally.
- Network drop: WebSocket closes; user can retry (consider chunk buffering for resilience).

## Future Port (Capacitor)

- Wrap the web app with Capacitor to get a native iOS shell.
- Replace mic pipeline with native audio for lower latency if needed.
- Use native Google sign-in plugin and secure key storage.

## Diarization Best Practices

- Move recorder close to the lecturer; use cardioid external mics.
- Create **class-specific vocabularies** (terms, names, symbols).
- Periodically fine-tune the language model with class audio (where policy allows).
- Provide **manual speaker rename** UI (extend the transcript view with inline edits).
- Validate diarization with **synthetic overlap tests** (mix two tracks with controlled overlap).

## API Keys Setup

- **AWS**: Create IAM user with `transcribe:StartStreamTranscriptionWebSocket` and related permissions.
- **OpenAI**: Set `OPENAI_API_KEY`.
- **Google**: Create OAuth 2.0 Client ID/Secret and configure redirect URL.
- **AssemblyAI** (optional): Set `ASSEMBLYAI_API_KEY`.

## Build & Run (Prod)

```bash
npm run build
NODE_ENV=production node dist/app.js
```

Serve behind HTTPS and a reverse proxy (Caddy, Nginx) so iOS mic + PWA features work consistently.

---

**Security Notes**: This demo keeps auth simple (no password hashing, no CSRF state on Google). For production, add hashing (bcrypt), CSRF-safe OAuth state, strict CORS, and secure cookie/session management.
