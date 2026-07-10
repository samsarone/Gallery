# Samsar Gallery

The public Samsar video library. Desktop presents a landscape-first discovery
experience with a featured film, a horizontal Shorts carousel, and a landscape
video grid. Mobile opens directly into an autoplaying vertical feed.

Use the API to create T2V up to 3 minutes long. Find docs here: https://docs.samsar.one

## Run locally

```bash
cp .env.example .env.local
npm install
npm run dev
```

Google sign-in probably will not work in local development. You can create registrations with email and password instead.

## Gallery administration

Administrators can manage publications at `/admin`. The route verifies the
current Samsar session and requires `isAdminUser`. Publishing requires the ID of
a completed Samsar video session; editing updates its public metadata, and
deleting revokes the publication without deleting the source session.

## Search, recommendations, and indexing

All Samsar API calls stay on the Next.js server. Configure these variables in
Vercel Production and in the ignored local `.env.production` file:

```bash
SAMSAR_API_KEY=your_server_api_key
CRON_SECRET=a_random_secret_at_least_16_characters
GALLERY_VIEWER_SALT=a_separate_random_secret
```

`SAMSAR_API_KEY` must be a server API key, never a `NEXT_PUBLIC_*` variable.
The production API endpoint is fixed at `https://api.samsar.one` in the application.
The deployment postbuild requests an incremental index sync, and the secured
`/api/cron/gallery-embeddings` Vercel cron repeats it hourly. Failed deployment
syncs are non-fatal because the cron is the durable retry path.

The processor stores semantic records and watch history in the dedicated
`SamsarGallery` Cosmos Mongo database. Search blends semantic relevance,
keywords, views, engagement, completion quality, and freshness. Recommendations
blend the current video with a signed viewer identifier derived from watch
history; raw Samsar user IDs are not sent to the gallery index.
