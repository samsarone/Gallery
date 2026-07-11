# Samsar Gallery

The public Samsar video library. Desktop presents recommendation-ranked portrait
features and landscape video grids. Mobile opens on a mixed 16:9 and 9:16 browse
library, then enters an aspect-specific recommendation feed after selection.

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
GALLERY_VIEWER_SALT=a_separate_random_secret
```

`SAMSAR_API_KEY` must be a server API key, never a `NEXT_PUBLIC_*` variable.
The production API endpoint is fixed at `https://api.samsar.one` in the application.
The deployment postbuild requests a stale-guarded incremental index sync. There
is no Vercel cron. Each Gallery browser session also makes one background refresh
request; the processor atomically allows only the first request after one hour to
diff changed publications and update their embeddings. Concurrent and fresh
requests return without starting another job.

The processor stores semantic records and watch history in the dedicated
`SamsarGallery` Cosmos Mongo database. Search blends semantic relevance,
keywords, views, engagement, completion quality, and freshness. Recommendations
blend the current video with a signed viewer identifier derived from watch
history; raw Samsar user IDs are not sent to the gallery index.

## License

Samsar Gallery is released under the [MIT License](LICENSE).
