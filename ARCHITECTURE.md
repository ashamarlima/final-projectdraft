# Architecture

A guided tour of this codebase: how a request travels through it, where
everything lives, and the order worth reading things in.

It is written for someone seeing the project for the first time. If you only
read one section, read **Phase 2 — Trace a request** below, and follow it
with the code open beside you.

---

## What this is

Two independent applications in one repository, talking over `/api/v1`:

| | Stack | Role |
|---|---|---|
| `client/` | Vite, React 19, React Router 7, Tailwind 4, axios | the browser app |
| `server/` | Express 5, Mongoose 9, Gemini, Supabase Storage | the API |

A school study platform. Admins and teachers manage users, classes and a
library of lesson PDFs; students read those lessons and study with an AI
assistant, their own notes, quizzes, and XP levelling.

Roughly **7,900 lines of server source against 10,900 lines of tests** (250
server tests, 34 client tests). The tests are not an afterthought — they are
the most detailed documentation in the repo, and the **Testing** section at
the end explains how to read them.

---

## The two ideas that explain the layout

**1. Vertical slices, not layers.**

`server/features/<name>/` holds one feature's routes, controllers and models
*together*:

```
features/materials/   materials: the lesson PDF library
  materialRoutes.js       the endpoint table
  materialControllers.js  the behaviour
  materialAiControllers.js the lesson AI assistant
  LessonMaterial.js       the schema and its indexes
```

The client mirrors it exactly (`client/src/features/materials/`). To
understand "notes", you read two folders, not fifteen. Adding a feature
means adding a folder on each side, not editing a central registry.

**2. A `shared/` layer for anything more than one slice needs.**

Every import of `../../shared/...` is a boundary crossing, from feature code
into infrastructure: authentication, rate limiting, object storage, the AI
provider, image and PDF handling, XP rules.

The dependency points one way — `features/` imports `shared/`, never the
reverse — with exactly one deliberate exception: `shared/authMiddleware.js`
loads the `User` model, because `protect()` has to look up the account
behind the cookie. `shared/xp.js` is written dependency-free for the same
family of reasons, so that `userModels.js` can require it without a cycle.

---

## The request lifecycle

Every request, without exception, follows the same path, in the same order.
Once this shape is familiar, the rest of the codebase is detail.

```
  client/src/features/<x>/<X>Page.jsx
        |
        |  1. the component that renders the page
        v
  client/src/features/<x>/<x>API.js
        |
        |  2. one exported function per endpoint
        v
  client/src/shared/api/apiClient.js
        |
        |  3. the ONE axios instance: baseURL /api/v1, withCredentials
        |     (which is what sends the httpOnly session cookie), and a
        |     single error interceptor every caller inherits
        v
  ========================= network =========================
        |
        |  4. in development, vite.config.js proxies /api/* to :5000;
        |     in production VITE_API_URL points straight at the API
        v
  server/app.js
        |
        |  5. security and parsing first, then one router per feature:
        |     helmet -> cors -> cookieParser -> express.json -> router
        v
  server/features/<x>/<x>Routes.js
        |
        |  6. the endpoint table: path -> guards -> controller
        +--> server/shared/authMiddleware.js
        |        protect() reads the cookie and loads the user;
        |        allowRoles(...) checks the role
        +--> server/shared/rateLimit.js
        |        loginLimiter (per address), aiLimiter (per student)
        v
  server/features/<x>/<x>Controllers.js
        |
        |  7. validate the input, do the work, answer with JSON
        +--> features/<x>/<X>.js     the Mongoose model -> MongoDB
        +--> shared/storage/         putObject, signed urls
        +--> shared/ai.js            Gemini, retried, never fatal
        +--> shared/images.js        byte sniffing, image -> PDF
```

**The error path is the same for everyone.** A controller that throws is
caught by the single handler at the bottom of `app.js`, which answers JSON.
Its rule, which every controller also follows in its own `catch`: *a
response says what failed, never how.* Only errors deliberately thrown with
a 4xx status repeat their message back; anything else is a generic 500 with
the real detail going to the log.

---

## Folder map

```
.
+-- client/                          the browser app (Vite + React 19)
|   +-- index.html
|   +-- vite.config.js               dev proxy for /api, and the Vitest config
|   +-- .env.example                 VITE_API_URL (empty = same origin)
|   +-- src/
|       +-- main.jsx                 mounts App inside BrowserRouter (10 lines)
|       +-- App.jsx                  the auth gate + the admin/teacher shell
|       +-- index.css                Tailwind entry
|       +-- shared/
|       |   +-- api/apiClient.js     the one axios instance
|       |   +-- form/readFormValues.js  reads a form into a plain object
|       +-- features/
|       |   +-- users/               Login, UserManagementPage, ClassManagement
|       |   +-- materials/           the admin lesson library (+ components/)
|       |   +-- student/             the student shell and its pages
|       |   +-- notes/               notes, flashcards, quiz UI
|       |   +-- quizzes/             quizzesAPI
|       |   +-- ai/                  StudentAIChat, VideoPlayerModal
|       +-- test/setup.js            jest-dom matchers for Vitest
|
+-- server/                          the API (Express 5)
    +-- server.js                    boot: env checks -> Mongo -> listen
    +-- app.js                       middleware order + the error handler
    +-- seed.js                      creates the first admin (random password)
    +-- .env.example                 every setting, documented
    +-- shared/                      cross-cutting; never imports features/
    |   +-- authMiddleware.js        cookie session, protect(), allowRoles()
    |   +-- rateLimit.js             loginLimiter, aiLimiter
    |   +-- storage/                 driver interface + local/supabase + signing
    |   +-- ai.js                    every Gemini call goes through here
    |   +-- images.js, pdf.js        byte sniffing, image->PDF, text extraction
    |   +-- uploadMiddleware.js      multer in memory + per-route limits
    |   +-- xp.js                    levels and XP rules (dependency-free)
    +-- features/
    |   +-- users/                   auth, user CRUD, classes, grades, XP
    |   +-- materials/               the lesson PDF library (deepest slice)
    |   +-- notes/                   student notes + their AI assistant
    |   +-- quizzes/                 attempts, server-side grading, XP
    |   +-- videos/                  watch-time tracking -> XP
    |   +-- chat/                    the student AI chat
    +-- scripts/                     one-shot maintenance, run via npm scripts
```

Where features keep their tests: next to the code they cover, as
`<name>.test.js` (server, run by `node --test`) or `<Name>.test.jsx`
(client, run by Vitest).

---

## The learning path

### Phase 1 — the skeleton

Read these in order. About an hour, and everything later is easier for it.

| # | File | What to take from it |
|---|---|---|
| 1 | `server/server.js` | The boot sequence in ~70 lines: every required env var is checked and `process.exit(1)`s *before* Mongo is contacted, so a misconfigured deploy fails loudly at start instead of at the first request. |
| 2 | `server/app.js` | Middleware *order* is the lesson. Note the comments on the two helmet defaults that had to be relaxed, and read the error handler at the bottom — it is the contract the whole server obeys. |
| 3 | `server/shared/authMiddleware.js` | The complete session story in one file: httpOnly cookie, `SameSite`/`Secure` chosen per environment, `protect()`, `allowRoles()`. |
| 4 | `server/features/users/userRoutes.js` | Read as a **template**, not as users code. Every other routes file is the same table of (path, guards, controller) — and the ordering comments explain why routes are declared in the order they are. |
| 5 | `client/src/main.jsx` | Ten lines: React root, `BrowserRouter`, `App`. |
| 6 | `client/src/App.jsx` | The auth gate: it reads a cached user out of localStorage for the first paint, then asks the server, because the real session token is in an httpOnly cookie that JavaScript cannot read. Also the role split: students get their own shell. |

### Phase 2 — Trace a request

The highest-value exercise in the repo. Pick a request and follow it from
the click to the MongoDB document, with the files open.

**Start with login.** Short, but it touches every layer:

```
Login.jsx -> userAPI.js -> apiClient.js -> (proxy) -> app.js
  -> userRoutes.js -> loginLimiter -> userControllers.loginUser
  -> bcrypt.compare -> jwt.sign -> setAuthCookie -> response
  -> localStorage + onLogin callback
```

Then **upload a lesson** (`client/src/features/materials/components/UploadForm.jsx`),
because it is the richest path in the app:

```
multer (memory) -> looksLikePdf (byte sniffing, not the declared type)
  -> imageToPdf for a photo -> storage driver putObject
  -> Gemini text extraction (failure tolerated, see below)
  -> position assignment with a race guard -> MongoDB
  -> later: a signed URL opened in an iframe
```

Open `server/features/materials/materialControllers.js` beside these notes
for that one; `createMaterial` is where it all meets.

### Phase 3 — Feature slices, easiest first

| Order | Feature | Why here |
|---|---|---|
| 1 | `videos/` | Smallest complete slice: watch time becomes XP. |
| 2 | `users/` | Auth, roles, user CRUD, class management, the leaderboard. |
| 3 | `notes/` | Notes plus their AI assistant; the first Gemini consumer. |
| 4 | `quizzes/` | Server-side grading and idempotent XP. |
| 5 | `materials/` | Deepest slice (1,100+ lines of controller). Do it last, with Phase 2 behind you. |

### Phase 4 — `server/shared/`

`storage/` (the driver interface, then `localDriver.js`, then the HMAC in
`signUrl.js`), `images.js`, `pdf.js`, `ai.js`, `rateLimit.js`, `xp.js`.

### Phase 5 — the tests as documentation

Read the test file for a controller immediately after the controller. The
suites are written as specifications with prose comments, and
`server/features/materials/materials.test.js` (2,578 lines) doubles as the
full description of the upload path.

---

## Five parts worth studying deliberately

These are where the real engineering is. Skim CRUD; slow down here.

**1. Signed URLs without an object store.** `shared/storage/localDriver.js`
and `signUrl.js`. The local driver has no presigning mechanism, so it fakes
one: it HMAC-signs a link to the app's own `/file` endpoint, comparing with
`timingSafeEqual` and rejecting an expired `expires`. That is also why
`GET /materials/file` has **no** Bearer check — an `<iframe>` cannot send
headers, so the credential travels in the query string and the signature is
the credential.

**2. The position race.** `LessonMaterial.js` declares a *second*, unique
index on `position` within a lesson group. `createAtNextPosition` reads the
last position and then writes, so two simultaneous uploads can compute the
same number; the index turns that into a duplicate-key error and the code
retries with a fresh value. `reorderMaterials` then has to write new
positions in **two phases**, because writing `0..n-1` directly collides with
the documents still holding those values.

**3. Idempotent XP.** `shared/xp.js` and the quizzes controller. A quiz
credits only the improvement over the student's previous best on the same
note, so retaking cannot be farmed. Grades contribute their own value as XP,
so re-saving the same marks gains nothing. The level is a virtual derived
from stored XP, so the two can never disagree.

**4. Graceful AI degradation.** `shared/ai.js` retries 429/5xx with jittered
backoff, but a lesson whose text could not be read still uploads and
previews — it simply has no assistant. `rereadMaterialText` re-reads the
stored PDF through Gemini, which is what makes a failed photo read
recoverable at all, and `scripts/backfillMaterialText.js` does the same in
bulk.

**5. The test seam.** Endpoint tests stub whole models by writing
`require.cache` (see `stubModule` in any `*.test.js`), which means the real
model is never loaded — and a broken `require` path *inside* a stubbed
module would be invisible to the suite. That is exactly why
`scripts/checkModulePaths.js` exists and runs as a `pretest` step. Once you
see that, the test suite stops looking incidental and starts looking
designed.

---

## Two naming quirks, so they do not confuse you

**Subjects are named three different ways.** The lesson library enum is
`English / Math / Natural Sciences`. The student shell shows `Mathematics /
Science / English`. The user schema's grade columns are `Math / Literature /
Science`. The mapping between them lives in
`client/src/features/materials/subjects.js` — read its comments *before*
grepping for a subject name, or you will conclude something is broken when
it is deliberate.

**The two shells use different navigation.** Admin and teacher pages are
switched by React state in `App.jsx` (no router). Students get real routing:
`features/student/StudentDashboard.jsx` owns the `Routes` table —
`learn`, `subjects/:subject`, `lessons/:id`, `ai`, `notes`, `notes/:id`,
`quizzes`, `leaderboard`, `achievements`, `profile`, `grades`.

---

## Running it

```bash
cd server && npm install
cp .env.example .env      # fill in the values below

cd ../client && npm install
npm run dev               # http://localhost:5173, proxying /api to :5000
```

`server.js` refuses to start without `Database_URL`, `database_password`,
`JWT_SECRET` and `GEMINI_API_KEY`.

For experimenting safely:

- **`STORAGE_DRIVER=local`** writes files to `server/storage/` and needs no
  account (`supabase` is what `.env.example` defaults to).
- **`RATE_LIMIT_DISABLED=true`** while driving the API by hand, so a script
  loop does not have to sit out a window.
- **`npm run seed`** creates the first admin and prints a randomly generated
  password once. There are no default credentials, by design.

Useful test/check commands:

| Command | Where | What |
|---|---|---|
| `npm test` | both | the suite (`node --test` / `vitest run`) |
| `npm test` | server | also runs `check:imports` first |
| `npm run lint` | client | ESLint |
| `npm run normalize:user-emails -- --dry-run` | server | report what a data migration would change |
| `npm run backfill:lesson-text` | server | read text out of lessons uploaded before that existed |
| `npm run fix:lesson-positions` | server | repair duplicate PDF positions from before the unique index |

---

## Testing

**Server** — `node --test`, no framework. Each suite starts the real Express
app on an ephemeral port and drives it with `fetch`, with the model it needs
stubbed in `require.cache`. Real routes, real middleware, real bcrypt, no
database. `.e2e/` (gitignored) holds scratch scripts for driving a *running*
API by hand; it contains real session tokens and must never be committed.

**Client** — Vitest with jsdom and Testing Library. `restoreMocks: true` is
set in `vite.config.js`, so one test cannot leak a spy into the next.

---

## Conventions this codebase holds to

1. **Comment the *why*.** The code is comment-heavy on purpose: the comments
   record the decision and the failure it prevents, not what the line does.
   When you change something, update the comment that justified it.
2. **Say what failed, never how.** Every error response is a fixed, safe
   message; the detail goes to `console.error`.
3. **Validate against the schema.** `User.schema.path('classroom').enumValues`
   and friends are read from the model, so validation and storage cannot
   disagree.
4. **The dependency between `features/` and `shared/` points one way**
   (`features/` -> `shared/`). The single exception is `authMiddleware.js`,
   which needs the `User` model.
5. **A missing API key is a 500; the provider being unavailable is a 502.**
   The AI endpoints are the one deliberate exception to rule 2, because a
   quota error is something the caller can act on.
