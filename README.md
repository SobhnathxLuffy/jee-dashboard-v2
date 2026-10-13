# JEE Study App

A local-first JEE preparation console. **All data stays in your browser (IndexedDB)** — no account needed, works offline.

- **Dashboard** — Today's todo list, focus timer, time log, deadlines
- **Question Bank** — JSON batch import, practice mode, drag & drop
- **Tests** — NTA-rule CBT player, PDF page-mode papers, answer-key parsing, review with error tags (C/F/A/R/T/G)
- **Syllabus tracker** — 65 chapters with Tier 1/2/3 badges, recall checks
- **Performance** — Weekly scorecard, chapter health, score timeline, accuracy metrics
- **Data** — Full JSON backup export and restore

## Run it on your machine

One command:

```bash
npm install
npm run dev
```

Or for production build:

```bash
npm run build
npm start
```

Then open `http://localhost:3000`.

> **Data origin rule:** always open the app via `localhost`, never `127.0.0.1`. IndexedDB is scoped per-origin, and `localhost:3000` vs `127.0.0.1:3000` are two different origins with two separate data sets.

## Development

```bash
npm install
npm run dev
npm run lint
```

Stack: Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui · IndexedDB · pdfjs-dist · recharts.
