import type { CatalogItem, TasteSignal } from "../types";
import { releaseYear } from "../lib/format";
import { BookmarkIcon, HeartIcon, ThumbsDownIcon } from "./Icons";
import { Artwork } from "./Artwork";

interface MediaCardProps {
  item: CatalogItem;
  onOpen: (item: CatalogItem) => void;
  inWatchlist: boolean;
  onToggleWatchlist: (key: string) => void;
  tasteSignal?: TasteSignal["value"];
  onTasteSignal?: (key: string, value: TasteSignal["value"] | null) => void;
  reason?: string;
}

export function MediaCard({
  item,
  onOpen,
  inWatchlist,
  onToggleWatchlist,
  tasteSignal,
  onTasteSignal,
  reason,
}: MediaCardProps) {
  return (
    <article className="media-card">
      <button className="poster-button" type="button" onClick={() => onOpen(item)}>
        <Artwork item={item} variant="poster" decorative />
        <span className="media-type-chip">{item.mediaType === "movie" ? "FILM" : "SERIES"}</span>
        <span className="rating-chip">★ {item.voteAverage ? item.voteAverage.toFixed(1) : "—"}</span>
      </button>

      <div className="card-body">
        <div className="provider-row" aria-label="Available on">
          {item.providerLinks.slice(0, 3).map((provider) => (
            <span key={provider.providerId} className="provider-pill">{provider.providerName}</span>
          ))}
          {item.providerLinks.length > 3 && (
            <span className="provider-pill muted">+{item.providerLinks.length - 3}</span>
          )}
        </div>
        <button className="title-button" type="button" onClick={() => onOpen(item)}>
          <strong>{item.title}</strong>
          <span>{releaseYear(item.releaseDate)} · {item.genreNames.slice(0, 2).join(" · ") || "Uncategorised"}</span>
        </button>
        {reason && <p className="recommendation-reason">{reason}</p>}

        <div className="card-actions">
          <button
            type="button"
            className={`icon-button ${inWatchlist ? "selected" : ""}`}
            onClick={() => onToggleWatchlist(item.key)}
            aria-label={inWatchlist ? "Remove from watchlist" : "Add to watchlist"}
            title={inWatchlist ? "Remove from watchlist" : "Add to watchlist"}
          >
            <BookmarkIcon fill={inWatchlist ? "currentColor" : "none"} />
          </button>
          {onTasteSignal && (
            <>
              <button
                type="button"
                className={`icon-button ${tasteSignal === "liked" ? "selected positive" : ""}`}
                onClick={() => onTasteSignal(item.key, tasteSignal === "liked" ? null : "liked")}
                aria-label="More like this"
                title="More like this"
              >
                <HeartIcon fill={tasteSignal === "liked" ? "currentColor" : "none"} />
              </button>
              <button
                type="button"
                className={`icon-button ${tasteSignal === "disliked" ? "selected negative" : ""}`}
                onClick={() => onTasteSignal(item.key, tasteSignal === "disliked" ? null : "disliked")}
                aria-label="Not for me"
                title="Not for me"
              >
                <ThumbsDownIcon />
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
