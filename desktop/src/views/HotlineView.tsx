import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CatalogItem, HotlineEpisode, HotlineFeed, MediaType, Provider } from "../types";
import { Artwork } from "../components/Artwork";
import { ChevronIcon, ExternalIcon, FlameIcon } from "../components/Icons";
import { BACKDROP_ROOT, POSTER_ROOT, STILL_ROOT } from "../lib/catalogFeed";
import { releaseYear } from "../lib/format";
import { rankHotlineItems } from "../lib/hotline";
import { openExternal } from "../lib/providerLinks";

const PROVIDER_ORDER = [8, 337, 1899, 9];
const PROVIDER_LABELS = new Map<number, string>([
  [8, "Netflix"],
  [337, "Disney+"],
  [1899, "HBO / Max"],
  [9, "Prime Video"],
]);

interface HotlineViewProps {
  catalog: CatalogItem[];
  providers: Provider[];
  hotline: HotlineFeed | null;
  onOpen: (item: CatalogItem) => void;
}

interface HotlineRailProps {
  title: string;
  detail: string;
  children: ReactNode;
}

function HotlineRail({ title, detail, children }: HotlineRailProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scroll = (direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * Math.max(320, track.clientWidth * 0.82), behavior: "smooth" });
  };

  return (
    <section className="hotline-section">
      <div className="hotline-section-heading">
        <div><h2>{title}</h2><p>{detail}</p></div>
        <div className="hotline-rail-controls" aria-label={`${title} carousel controls`}>
          <button type="button" onClick={() => scroll(-1)} aria-label={`Scroll ${title} left`}>
            <ChevronIcon />
          </button>
          <button type="button" onClick={() => scroll(1)} aria-label={`Scroll ${title} right`}>
            <ChevronIcon />
          </button>
        </div>
      </div>
      <div className="hotline-track" ref={trackRef}>{children}</div>
    </section>
  );
}

function TrendingCard({ item, onOpen }: { item: CatalogItem; onOpen: (item: CatalogItem) => void }) {
  return (
    <article className="hotline-title-card">
      <button className="hotline-poster" type="button" onClick={() => onOpen(item)}>
        <Artwork item={item} variant="poster" decorative />
        <span className={`hotline-rank ${item.trendingRank ? "weekly" : "popular"}`}>
          {item.trendingRank ? `#${item.trendingRank} TRENDING` : "POPULAR"}
        </span>
      </button>
      <button className="hotline-card-copy" type="button" onClick={() => onOpen(item)}>
        <strong>{item.title}</strong>
        <span>{releaseYear(item.releaseDate)} · ★ {item.voteAverage ? item.voteAverage.toFixed(1) : "—"}</span>
      </button>
    </article>
  );
}

function EpisodeArtwork({ episode }: { episode: HotlineEpisode }) {
  const source = episode.stillPath
    ? STILL_ROOT + episode.stillPath
    : episode.seriesBackdropPath
      ? BACKDROP_ROOT + episode.seriesBackdropPath
      : episode.seriesPosterPath
        ? POSTER_ROOT + episode.seriesPosterPath
        : null;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source]);

  if (!source || failed) {
    return <div className="hotline-episode-fallback"><span>{episode.seriesTitle.slice(0, 1)}</span></div>;
  }
  return (
    <img
      src={source}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

function EpisodeCard({ episode }: { episode: HotlineEpisode }) {
  const episodeCode = `S${String(episode.seasonNumber).padStart(2, "0")}E${String(episode.episodeNumber).padStart(2, "0")}`;
  const open = () => void openExternal(episode.url).catch(() => undefined);
  return (
    <article className="hotline-episode-card">
      <button className="hotline-episode-art" type="button" onClick={open}>
        <EpisodeArtwork episode={episode} />
        <span className="hotline-episode-code">{episodeCode}</span>
        <span className="hotline-external"><ExternalIcon /></span>
      </button>
      <button className="hotline-episode-copy" type="button" onClick={open}>
        <span>{episode.seriesTitle} · {episode.airDate}</span>
        <strong>{episode.episodeName}</strong>
        <p>{episode.overview || "Open Dropout to see this episode."}</p>
      </button>
    </article>
  );
}

function providerRows(catalog: CatalogItem[], provider: Provider, onOpen: (item: CatalogItem) => void) {
  return (["movie", "tv"] as MediaType[]).map((mediaType) => {
    const items = rankHotlineItems(catalog, provider.id, mediaType);
    const medium = mediaType === "movie" ? "Movies" : "Series";
    return (
      <HotlineRail
        key={`${provider.id}:${mediaType}`}
        title={`${PROVIDER_LABELS.get(provider.id) ?? provider.name} Trending ${medium}`}
        detail="Weekly TMDb trend position first, then current popularity. Subscription titles only."
      >
        {items.length > 0 ? items.map((item) => (
          <TrendingCard key={item.key} item={item} onOpen={onOpen} />
        )) : (
          <div className="hotline-inline-empty">No released {medium.toLocaleLowerCase()} are cached for this service yet.</div>
        )}
      </HotlineRail>
    );
  });
}

export function HotlineView({ catalog, providers, hotline, onOpen }: HotlineViewProps) {
  const selectedIds = new Set(providers.map((provider) => provider.id));
  const orderedProviders = PROVIDER_ORDER
    .map((id) => providers.find((provider) => provider.id === id))
    .filter((provider): provider is Provider => Boolean(provider));
  const includesDropout = selectedIds.has(-101);
  const refreshed = hotline
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })
        .format(new Date(hotline.ranking.refreshedAt))
    : "waiting for first update";

  return (
    <div className="view hotline-view">
      <header className="view-header hotline-header">
        <div>
          <span className="eyebrow">WHAT’S HOT RIGHT NOW</span>
          <h1>Hotline</h1>
          <p className="header-copy">
            What people are watching across your selected subscriptions, plus the newest episodes
            from your Dropout favorites. “Update now” refreshes this page too.
          </p>
        </div>
        <div className="hotline-status"><FlameIcon /><span><strong>Latest feed</strong><small>{refreshed}</small></span></div>
      </header>

      <div className="hotline-stack">
        {orderedProviders.flatMap((provider) => providerRows(catalog, provider, onOpen))}
        {includesDropout && (
          <HotlineRail
            title="Dropout Latest from Your Favorites"
            detail="Dimension 20, Game Changer, Make Some Noise and Smartypants."
          >
            {hotline?.dropout.episodes.length ? hotline.dropout.episodes.map((episode) => (
              <EpisodeCard key={episode.key} episode={episode} />
            )) : (
              <div className="hotline-inline-empty wide">
                Select “Update now” to load the latest aired episodes from your Dropout favorites.
              </div>
            )}
          </HotlineRail>
        )}
      </div>
    </div>
  );
}
