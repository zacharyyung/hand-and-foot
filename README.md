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
5. Deploy — you'll get a URL like `your-project.vercel.app`.

The included `vercel.json` enables client-side routing for the single-page app.

## Current features

- 4- or 6-player games (2 or 3 teams)
- Combined multi-deck creation (one deck per player, with jokers)
- Fisher-Yates shuffle
- Proper dealing: 11-card foot piles, then 11-card hands
- Stock and discard pile setup (wild cards and red 3s buried from discard starter)
- Visual game board with stock, discard, and player areas
- AI partners, table chat, meld tracking, undo / start-over votes
