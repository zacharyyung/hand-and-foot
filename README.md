# Hand and Foot

Vibe coded Hand and Foot game — a web-based card game built with Vite, React, and Tailwind CSS.

## Setup

```bash
npm install
```

## Run locally

```bash
npm run dev
```

Open the URL shown in the terminal (typically http://localhost:5173).

## Deploy to Vercel (Phase 1)

1. Push this repo to GitHub.
2. Sign in at [vercel.com](https://vercel.com) and **Add New Project**.
3. Import the GitHub repository.
4. Use the defaults Vercel detects for Vite:
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. In **Project Settings → Environment Variables**, add:
   - `ELEVENLABS_API_KEY` — your [ElevenLabs](https://elevenlabs.io) API key (required for AI partner voice on phone/production)
6. Deploy — you'll get a URL like `your-project.vercel.app`.
7. After changing env vars, **Redeploy** so the `/api/narration-tts` function picks them up.

The included `vercel.json` enables client-side routing for the single-page app and keeps `/api/*` serverless routes.

### ElevenLabs (local dev)

1. Copy `.env.example` to `.env`
2. Set `ELEVENLABS_API_KEY=your_key_here`
3. Restart the dev server (`npm run dev`)

Partner voice calls `/api/narration-tts` on the server — the key is never sent to the browser.

## Current features

- 4- or 6-player games (2 or 3 teams)
- Combined multi-deck creation (one deck per player, with jokers)
- Fisher-Yates shuffle
- Proper dealing: 11-card foot piles, then 11-card hands
- Stock and discard pile setup (wild cards and red 3s buried from discard starter)
- Visual game board with stock, discard, and player areas
- AI partners, table chat, meld tracking, undo / start-over votes
