import { useEffect } from "react";
import type { CatalogItem, CustomSite } from "../types";
import { openCustomSite, openProvider } from "../lib/providerLinks";
import { releaseYear } from "../lib/format";
import { BookmarkIcon, CloseIcon, ExternalIcon, ShieldIcon } from "./Icons";
import { Artwork } from "./Artwork";

interface DetailModalProps {
  item: CatalogItem;
  customSites: CustomSite[];
  inWatchlist: boolean;
  onToggleWatchlist: (key: string) => void;
  onClose: () => void;
}

export function DetailModal({
  item,
  customSites,
  inWatchlist,
  onToggleWatchlist,
  onClose,
}: DetailModalProps) {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [onClose]);

  return (
    <div className="modal-layer" role="presentation" onMouseDown={onClose}>
      <section
        className="detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="detail-backdrop">
          <Artwork item={item} variant="backdrop" decorative loading="eager" />
          <div className="backdrop-scrim" />
          <button className="modal-close" type="button" onClick={onClose} aria-label="Close details">
            <CloseIcon />
          </button>
        </div>

        <div className="detail-content">
          <div className="detail-poster">
            <Artwork item={item} variant="poster" decorative loading="eager" />
          </div>
          <div className="detail-copy">
            <div className="detail-kicker">
              {item.mediaType === "movie" ? "FILM" : "SERIES"} · {releaseYear(item.releaseDate)} · ★ {item.voteAverage ? item.voteAverage.toFixed(1) : "—"}
            </div>
            <h2 id="detail-title">{item.title}</h2>
            <div className="genre-row">
              {item.genreNames.map((genre) => <span key={genre}>{genre}</span>)}
            </div>
            <p className="overview">{item.overview || "No description is available yet."}</p>

            <div className="watch-panel">
              <span className="eyebrow">INCLUDED WITH YOUR SERVICES</span>
              <div className="watch-buttons">
                {item.providerLinks.map((provider) => (
                  <button
                    key={provider.providerId}
                    className="watch-button"
                    type="button"
                    onClick={() => void openProvider(item, provider)}
                  >
                    Find on {provider.providerName}
                    <ExternalIcon />
                  </button>
                ))}
              </div>
              {customSites.length > 0 && (
                <>
                  <div className="custom-watch-divider" />
                  <span className="eyebrow">SEARCH YOUR ADDED SITES</span>
                  <div className="watch-buttons custom-watch-buttons">
                    {customSites.map((site) => (
                      <button
                        key={site.id}
                        className="watch-button custom"
                        type="button"
                        onClick={() => void openCustomSite(site, item.title)}
                      >
                        Search {site.name}
                        <ExternalIcon />
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="handoff-note">
                <ShieldIcon />
                <span>Opens the provider's own title search or browse screen in your normal browser. Watchmaker cannot see its login, cookies, or password.</span>
              </div>
            </div>

            <button
              className={`secondary-button ${inWatchlist ? "selected" : ""}`}
              type="button"
              onClick={() => onToggleWatchlist(item.key)}
            >
              <BookmarkIcon fill={inWatchlist ? "currentColor" : "none"} />
              {inWatchlist ? "Saved to watchlist" : "Add to watchlist"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
