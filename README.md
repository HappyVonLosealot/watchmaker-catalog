# Watchmaker catalogue feed

This repository builds the public, read-only catalogue used by the **Watchmaker** Windows desktop app.

## What it contains

- Movies, series, animation, and documentaries available in Turkey
- Netflix, Prime Video, Max, Disney+, and Dropout
- Subscription (`flatrate`) availability only—rentals and purchases are excluded
- Titles, descriptions, genres, ratings, release dates, provider links, and TMDb thumbnail paths
- Turkish metadata with English fallback

The generated files are published by GitHub Pages under `/v1`. Watchmaker downloads them only when the app starts; nothing runs in the background on the user's PC.

## Privacy and credentials

- The TMDb API read token is stored only as the encrypted GitHub Actions secret `TMDB_READ_TOKEN`.
- The token is never committed to this repository or included in Watchmaker.
- Watchmaker never asks for, reads, or stores Netflix, Prime Video, Max, Disney+, or Dropout credentials.
- Selecting a title opens the provider's website in the user's normal browser, where existing remembered sessions handle sign-in.

## Updating the feed

The `Refresh Watchmaker catalogue feed` workflow runs daily and can also be started manually from the **Actions** tab. It generates the feed, validates artwork and subscription-only availability, and deploys it to GitHub Pages.

This product uses the TMDb API but is not endorsed or certified by TMDb. Provider availability data is supplied through TMDb/JustWatch metadata and may occasionally lag behind a streaming service's own catalogue.
