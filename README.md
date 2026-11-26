# Shocialgram

Shocialgram is a responsive social photo-sharing app built with semantic HTML,
CSS, and vanilla JavaScript; an Express REST API; and PostgreSQL through Prisma.
The current implementation includes authentication, profiles, follows, image
posts, likes, comments, search, explore, and light/dark themes. Notifications
currently have a placeholder screen.

## Requirements and setup

- Node.js 20+
- PostgreSQL

1. Install packages: `npm install`
2. Copy `.env.example` to `.env`. Set `DATABASE_URL` and replace `JWT_SECRET`
   with a random value of at least 32 characters.
3. Generate the ORM client: `npm run prisma:generate`
4. Create/apply the database migration: `npm run prisma:migrate`
5. Start the server: `npm run dev` (or `npm start` for production mode).
6. Open `http://localhost:3000`. The API health check is
   `http://localhost:3000/api/health`.

Uploaded JPEG, PNG, and WebP files are signature-checked, limited to 8 MB, and
stored in `backend/uploads/`. The `.gitignore` excludes uploads and environment
files.

## Architecture

```text
frontend/
  index.html       Semantic app shell and accessible dialog forms
  styles.css       Responsive layout, reusable components, theme variables
  app.js           View rendering, interactions, and Fetch API client
backend/src/
  app.js           Express middleware, static files, API registration
  server.js        HTTP server startup
  config/          Environment validation and Prisma client
  controllers/     Auth, user, post, like, and comment request handlers
  middleware/      JWT auth, upload limits, error handling, 404 handling
  routes/          REST endpoint definitions
  utils/           Errors, async handler, image storage, public user shape
prisma/
  schema.prisma    PostgreSQL entities, relations, unique constraints, indexes
```

The browser sends JSON or multipart requests to `/api` with `fetch`; protected
requests include the JWT bearer token held in browser local storage. Express
validates/authorizes the request and controllers use Prisma to read/write
PostgreSQL. Uploaded images are stored outside the database and served through
`/uploads`. Passwords are bcrypt-hashed, and responses never include password
hashes.

## API outline

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/users/search?q=...`, `GET /api/users/:username`
- `PATCH /api/users/me`, `POST /api/users/me/avatar`
- `POST /api/users/:id/follow`, `GET /api/users/:username/followers|following`
- `GET /api/posts/feed`, `GET /api/posts/explore`, `POST /api/posts`
- `GET|PATCH|DELETE /api/posts/:id`
- `POST /api/posts/:id/likes`, `POST /api/posts/:id/comments`
- `DELETE /api/posts/:id/comments/:commentId`
- `GET|POST /api/messages`, `GET /api/messages/:userId`
- `POST /api/messages/share-post`

The Prisma models use cascading foreign keys, unique email/username and
per-user like/follow constraints, and indexes for feed, post, and connection
lookups. Usernames/emails are normalized at registration. The initial migration
is checked in under `prisma/migrations/`; `npm run prisma:migrate` applies it to
the PostgreSQL database configured by `DATABASE_URL`.
