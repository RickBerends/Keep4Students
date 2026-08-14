# Pubcrawl

An online game for running a pubcrawl around a city. Teams log in on their
phones, complete a photo/video challenge at each bar, and solve a riddle whose
answer is the name of the next bar.

```
CHALLENGE  ──upload accepted──▶  QUIZ  ──right answer──▶  next stop
   ▲                             │
   └── stuck? buy a hint with a side-challenge upload ──┘
```

This is scaffolding with one real round seeded. Adding the rest of the crawl
means editing one file: `src/content/crawl.ts`.

## Running it locally

```bash
npm install
cp .env.example .env      # set ADMIN_PASSWORD
npm run dev
```

Open http://localhost:3000, log in with event code `CRAWL2026` and any team
name.

Install `ffmpeg` locally if you want video duration and creation-time checks in
dev (`brew install ffmpeg` / `apt install ffmpeg`). Without it videos still
upload; they just get flagged rather than verified. The Docker image includes it.

```bash
npm test         # unit tests
npm run typecheck
npm run build && npm start
```

## Adding a stop

Everything is in `src/content/crawl.ts`. Append to `stops`:

```ts
{
  id: "stop-4",                     // unique, never change it mid-crawl
  name: "De Gouden Leeuw",
  challenge: {
    prompt: "Film the whole team doing the worm on the floor.",
    accept: "video",                // "video" | "photo" | "any"
    maxAgeMinutes: 10,              // must be shot in the last 10 minutes
    minDurationSec: 4,
  },
  quiz: {
    question: "Next one is named after a saint with a bad haircut.",
    answers: ["sint joris", "st joris"],
    hints: [
      { text: "It's on the square.",        requires: "shot" },
      { text: "Two words, starts with S.",  requires: "beer" },
    ],
    successText: "Correct. Go to Sint Joris and order the house special.",
  },
}
```

Restart (or redeploy) and it's live. The server validates the content at boot
and refuses to start on a duplicate id, an empty question, or a stop with no
answers — you find out at launch, not at 23:00 in a bar.

**Answers are matched loosely.** Case, accents, punctuation and small typos are
forgiven, so `Bet Koolen!`, `bet  koolen` and `bet kolen` all pass for
`bet koolen`. Only list genuinely different spellings, not every possible
mistake. Answers of four characters or fewer get no typo tolerance, so short
answers stay distinct.

**Hints** are revealed one at a time, each paid for with a side-challenge upload
(`shot`, `beer` or `selfie`). The prompts for those live in `sideChallenges` at
the top of the same file and are shared by every stop.

## How teams log in

One event code for the whole night, then a team name. Anyone typing the same
team name joins that team — that's how four people on four phones share one
team's progress. Every phone polls every 5 seconds, so when one person uploads,
the others' screens follow along.

There are no passwords and no real security. A team that wanted to could type a
rival's name and see their screen. That's the deliberate trade for a login your
friends can complete in a loud bar in ten seconds.

## Upload checks

Every upload is checked before it counts:

| Check | Behaviour when it fails |
| --- | --- |
| Right format (photo vs video) | Rejected |
| Under the size limit | Rejected |
| Video long enough / short enough | Rejected |
| Shot recently (`maxAgeMinutes`) | Rejected |
| Not a file this team already used | Rejected |

### Why freshness checks are best-effort

The freshness check reads the real capture time out of the file — EXIF
`DateTimeOriginal` for photos, the QuickTime creation tag for videos — and falls
back to the file date the browser reports.

iOS does not reliably preserve that metadata. Depending on whether the file was
captured in the browser or picked from the Photos library, and on whether iOS
transcodes it on the way out, the timestamp may be rewritten or absent.
So:

- **No timestamp at all** → accepted, but **flagged** in `/admin`. Rejecting
  would randomly block honest teams mid-crawl, which is worse than letting a
  cheat through.
- **Only the device file date** → accepted and flagged, because that value is
  trivially faked.
- **A timestamp from the future** → accepted and flagged (usually a wrong device
  clock, occasionally someone being clever).

The rule that actually holds is the **duplicate check**: every upload is hashed,
and a team cannot reuse a file it has already had accepted. That needs no
metadata, so it works no matter what iOS does. It's what stops one beer video
clearing the entire crawl.

`maxAgeMinutes` defaults to 10 rather than a tighter window on purpose — a
100MB video over pub 4G can take several minutes to upload, and a 2-minute
window fails honest teams. Tighten it per challenge if you want.

If you want to force camera capture instead of allowing library picks, add
`capture="environment"` to the file inputs in `src/views/play.ejs`. That makes
freshness much harder to fake, at the cost of no retakes and no trimming.

## Admin

`/admin`, HTTP basic auth, password from `ADMIN_PASSWORD` (any username).

- Every team's current stop, phase, hints used and start time
- **Skip challenge** — nudges a stuck team from CHALLENGE to QUIZ without
  making them redo the upload
- **Reset** — puts a team back to stop 1, keeping their uploads
- A gallery of every upload: accepted, flagged (amber) and rejected (red), with
  the reason
- A timeline of everything that happened, which is a decent souvenir

One caveat on the gallery: iPhone video is usually HEVC, which non-Apple
browsers can't play inline. It downloads fine, and plays inline on a Mac or
iPhone. Transcoding on upload would fix it and is deliberately not done here —
it's slow and this runs on a small machine.

## Deploying

Built for Fly.io with a volume, but it's a plain Docker container — Railway,
Render or any VPS works the same way. The only requirement is **persistent disk
mounted at `/data`**, because that's where SQLite and all the media live.

```bash
fly launch --no-deploy              # edit the app name in fly.toml first
fly volumes create crawl_data --size 20 --region ams
fly secrets set ADMIN_PASSWORD='something-not-changeme'
fly deploy
```

Size the volume for the media: roughly 8 teams × 10 stops × ~50MB per video
lands around 5–20GB. 20GB is a safe start.

An ugly `*.fly.dev` URL is fine — teams type it once. Consider a QR code on a
card for each team so nobody types it at all.

## Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | |
| `DATA_DIR` | `./data` | Use `/data` in production. SQLite + uploads. |
| `ADMIN_PASSWORD` | `changeme` | Change it. The server warns at boot if you haven't. |
| `EVENT_CODE` | from `crawl.ts` | Rotate the code without a code change. |
| `MAX_UPLOAD_MB` | `400` | Hard ceiling on any single upload. |

## Layout

```
src/
  server.ts             Express app, error handling
  config.ts             env vars and paths
  content/crawl.ts      ← the file you edit
  content/types.ts      shape of a stop, challenge, quiz, hint
  domain/state.ts       the state machine; all progression rules
  domain/answers.ts     normalization + typo-tolerant matching
  domain/teams.ts       join/create teams, sessions
  services/metadata.ts  EXIF/ffprobe extraction + the accept/reject rules
  services/uploads.ts   ties checks, storage and the DB together
  services/storage.ts   local disk today, swap for S3 in one file
  routes/               auth, play, scoreboard, admin
  views/                EJS templates
public/                 styles.css, app.js (no build step)
```

## Known limitations

- No real authentication; teams are trusted not to impersonate each other.
- Uploaded media is kept indefinitely with no retention policy. Delete the
  volume when you've collected the good bits.
- SQLite means one machine. That's plenty for a pubcrawl, but don't scale it out.
- Freshness checks are best-effort, as described above.
