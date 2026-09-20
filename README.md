# Watchmaker catalogue feed

This repository builds the public, read-only catalogue used by the **Watchmaker** Windows desktop app.

## What it contains

- Movies, series, animation, and documentaries available in Turkey
- Netflix, Prime Video, Max, Disney+, and Dropout
- Subscription (`flatrate`) availability only—rentals and purchases are excluded
- Titles, descriptions, genres, ratings, release dates, provider links, and TMDb thumbnail paths
- Precomputed multilingual synopsis fingerprints for meaning-based TasteMaker matches
- A Hotline page ranking subscription titles by TMDb's weekly trends, with popularity fallback
- Latest aired episodes from Dimension 20, Game Changer, Make Some Noise, and Smartypants
- Exact Disney+ title links resolved from free public Wikidata IDs when available
- Turkish metadata with English fallback

The generated files are published by GitHub Pages under `/v1`. Watchmaker downloads them when the app starts and whenever **Update now** is selected; nothing runs in the background on the user's PC.

Hotline trend ranks and Dropout episode metadata are refreshed by the same free daily catalogue build. Each desktop refresh pulls the newest published Hotline data, then stores it locally for instant offline reopening.

TasteMaker's meaning fingerprints are generated during this free scheduled build with the Apache-2.0-licensed `paraphrase-multilingual-MiniLM-L12-v2` model. The desktop app downloads only compact int8 fingerprints and compares them locally. It runs no live AI model, calls no AI API, sends no viewing preference anywhere, and creates no cost for the user.

Disney+ does not publish a stable externally prefilled search page. The catalogue therefore matches TMDb title IDs to public Wikidata Disney+ IDs during its free scheduled build. A match opens the exact localized Disney+ title page. An unmatched title opens TMDb's title-specific provider handoff instead of the Disney+ home page, so no title needs to be typed manually.

## Privacy and credentials

- The TMDb API read token is stored only as the encrypted GitHub Actions secret `TMDB_READ_TOKEN`.
- The token is never committed to this repository or included in Watchmaker.
- Watchmaker never asks for, reads, or stores Netflix, Prime Video, Max, Disney+, or Dropout credentials.
- Selecting a title opens the provider's website in the user's normal browser, where existing remembered sessions handle sign-in.

## Updating the feed

The `Refresh Watchmaker catalogue feed` workflow runs daily and can also be started manually from the **Actions** tab. It generates the feed, validates artwork and subscription-only availability, and deploys it to GitHub Pages.

This product uses the TMDb API but is not endorsed or certified by TMDb. Provider availability data is supplied through TMDb/JustWatch metadata and may occasionally lag behind a streaming service's own catalogue.
