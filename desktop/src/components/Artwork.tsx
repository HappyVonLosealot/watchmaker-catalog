import { useEffect, useMemo, useState } from "react";
import type { CatalogItem } from "../types";
import { BACKDROP_ROOT, POSTER_ROOT } from "../lib/catalogFeed";

interface ArtworkProps {
  item: CatalogItem;
  variant: "poster" | "backdrop" | "mini";
  className?: string;
  decorative?: boolean;
  loading?: "eager" | "lazy";
}

function artworkSource(item: CatalogItem, variant: ArtworkProps["variant"]): string | null {
  if (variant === "backdrop") {
    if (item.backdropPath) return BACKDROP_ROOT + item.backdropPath;
    if (item.posterPath) return POSTER_ROOT + item.posterPath;
    return null;
  }
  if (item.posterPath) return POSTER_ROOT + item.posterPath;
  if (item.backdropPath) return `https://image.tmdb.org/t/p/w780${item.backdropPath}`;
  return null;
}

export function Artwork({
  item,
  variant,
  className,
  decorative = false,
  loading = "lazy",
}: ArtworkProps) {
  const source = useMemo(() => artworkSource(item, variant), [item, variant]);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [source]);

  if (!source || failed) {
    return (
      <div
        className={[
          "poster-fallback",
          `artwork-fallback-${variant}`,
          variant === "mini" ? "mini-poster" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label={decorative ? undefined : `${item.title} artwork unavailable`}
        aria-hidden={decorative || undefined}
      >
        <span>{item.title.trim().slice(0, 1).toLocaleUpperCase() || "W"}</span>
      </div>
    );
  }

  return (
    <img
      className={[variant === "mini" ? "mini-poster" : "", className]
        .filter(Boolean)
        .join(" ")}
      src={source}
      alt={decorative ? "" : `${item.title} artwork`}
      loading={loading}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
