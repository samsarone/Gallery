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
