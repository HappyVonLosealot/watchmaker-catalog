import type { GenreOption, MediaType, Provider, SearchMode } from "../types";
import type { CatalogFilters } from "../lib/filtering";
import { CheckIcon, SearchIcon } from "./Icons";

interface SearchToolbarProps {
  filters: CatalogFilters;
  onChange: (filters: CatalogFilters) => void;
  providers: Provider[];
  genres: GenreOption[];
}

export function SearchToolbar({ filters, onChange, providers, genres }: SearchToolbarProps) {
  const setSearchMode = (searchMode: SearchMode) => {
    onChange({ ...filters, searchMode, query: "", selectedGenreIds: [] });
  };

  const toggleGenre = (genreId: number) => {
    const selected = filters.selectedGenreIds.includes(genreId);
    onChange({
      ...filters,
      selectedGenreIds: selected
        ? filters.selectedGenreIds.filter((id) => id !== genreId)
        : [...filters.selectedGenreIds, genreId],
    });
  };

  const placeholder = filters.searchMode === "concept"
    ? "Search descriptions: wedding, funeral, zombies…"
    : "Search a film or series by name…";

  return (
    <section className="search-suite" aria-label="Catalogue search and sorting">
      <div className="search-by-row">
        <span className="eyebrow">SEARCH BY</span>
        <div className="search-mode-control">
          {(["name", "tags", "concept"] as SearchMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={filters.searchMode === mode ? "active" : ""}
              onClick={() => setSearchMode(mode)}
            >
              {mode === "name" ? "Name" : mode === "tags" ? "Tags" : "Concept"}
            </button>
          ))}
        </div>
        <span className="search-mode-explainer">
          {filters.searchMode === "name" && "Matches title and original title"}
          {filters.searchMode === "tags" && "Every selected tag is required"}
          {filters.searchMode === "concept" && "Looks only inside descriptions"}
        </span>
      </div>

      <div className="search-toolbar">
        {filters.searchMode === "tags" ? (
          <div className="tag-search-summary">
            <span>{filters.selectedGenreIds.length
              ? `${filters.selectedGenreIds.length} tag${filters.selectedGenreIds.length === 1 ? "" : "s"} selected`
              : "Choose tags below"}</span>
            {filters.selectedGenreIds.length > 0 && (
              <button type="button" onClick={() => onChange({ ...filters, selectedGenreIds: [] })}>Clear</button>
            )}
          </div>
        ) : (
          <label className="search-box">
            <SearchIcon />
            <input
              value={filters.query}
              onChange={(event) => onChange({ ...filters, query: event.target.value })}
              placeholder={placeholder}
              aria-label={filters.searchMode === "concept" ? "Search descriptions by concept" : "Search catalogue by name"}
            />
            {filters.query && (
              <button type="button" onClick={() => onChange({ ...filters, query: "" })}>Clear</button>
            )}
          </label>
        )}
        <div className="segmented-control" aria-label="Media type">
          {(["all", "movie", "tv"] as Array<MediaType | "all">).map((mediaType) => (
            <button
              key={mediaType}
              type="button"
              className={filters.mediaType === mediaType ? "active" : ""}
              onClick={() => onChange({ ...filters, mediaType })}
            >
              {mediaType === "all" ? "Everything" : mediaType === "movie" ? "Films" : "Series"}
            </button>
          ))}
        </div>
        <select
          value={filters.providerId}
          onChange={(event) =>
            onChange({
              ...filters,
              providerId: event.target.value === "all" ? "all" : Number(event.target.value),
            })
          }
          aria-label="Filter by provider"
        >
          <option value="all">All services</option>
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>{provider.name}</option>
          ))}
        </select>
        <select
          value={filters.sortBy}
          onChange={(event) => onChange({ ...filters, sortBy: event.target.value as CatalogFilters["sortBy"] })}
          aria-label="Sort catalogue"
          title="Ratings use TMDb's free community score"
        >
          <option value="popularity">Sort: Popularity</option>
          <option value="rating">Sort: General rating</option>
          <option value="release-newest">Release: Newest</option>
          <option value="release-oldest">Release: Oldest</option>
        </select>
      </div>

      {filters.searchMode === "tags" && (
        <div className="tag-picker" aria-label="Choose all required tags">
          {genres.map((genre) => {
            const selected = filters.selectedGenreIds.includes(genre.id);
            return (
              <button
                key={genre.id}
                type="button"
                className={selected ? "selected" : ""}
                aria-pressed={selected}
                onClick={() => toggleGenre(genre.id)}
              >
                {selected && <CheckIcon />}
                {genre.name}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
