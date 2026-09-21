import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { CatalogItem, TasteSignal } from "../types";
import { recommendFromPrompt, type PromptRecommendationResult } from "../lib/promptRecommendations";
import { encodePromptLocally } from "../lib/localPromptEncoder";
import { SearchIcon } from "./Icons";
import { MediaGrid } from "./MediaGrid";

interface TellMeWhatYouWantProps {
  catalog: CatalogItem[];
  watchlist: Set<string>;
  tasteSignals: Map<string, TasteSignal["value"]>;
  onOpen: (item: CatalogItem) => void;
  onToggleWatchlist: (key: string) => void;
  onTasteSignal: (key: string, value: TasteSignal["value"] | null) => void;
}

const EXAMPLES = [
  "A funny zombie movie with friends, but no romance",
  "Something cozy and magical for a Sunday night",
  "A fast-paced mystery like Stranger Things, but funnier",
];

function formatLabel(format: "series" | "miniseries" | "movie"): string {
  if (format === "miniseries") return "mini series";
  return format;
}

export function TellMeWhatYouWant({
  catalog,
  watchlist,
  tasteSignals,
  onOpen,
  onToggleWatchlist,
  onTasteSignal,
}: TellMeWhatYouWantProps) {
  const [draft, setDraft] = useState("");
  const [submittedPrompt, setSubmittedPrompt] = useState("");
  const [resultLimit, setResultLimit] = useState(6);
  const [result, setResult] = useState<PromptRecommendationResult | null>(null);
  const [matching, setMatching] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const requestRef = useRef(0);

  useEffect(() => setResultLimit(6), [submittedPrompt]);
  useEffect(() => () => {
    requestRef.current += 1;
  }, []);

  const runPrompt = async (prompt: string) => {
    const request = requestRef.current + 1;
    requestRef.current = request;
    setSubmittedPrompt(prompt);
    setResult(null);
    setError("");
    setMatching(true);
    setStatus("Starting private whole-prompt matching…");
    try {
      const vector = await encodePromptLocally(prompt, (nextStatus) => {
        if (requestRef.current === request) setStatus(nextStatus);
      });
      if (requestRef.current !== request) return;
      setStatus("Comparing meaning with included title descriptions…");
      const nextResult = recommendFromPrompt(
        catalog,
        prompt,
        tasteSignals,
        Date.now(),
        vector,
      );
      if (requestRef.current === request) setResult(nextResult);
    } catch (caught) {
      if (requestRef.current === request) {
        setError(caught instanceof Error ? caught.message : "The local understanding model could not start.");
      }
    } finally {
      if (requestRef.current === request) {
        setMatching(false);
        setStatus("");
      }
    }
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const prompt = draft.trim();
    if (prompt.length >= 3 && !matching) void runPrompt(prompt);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    }
  };

  const useExample = (example: string) => {
    setDraft(example);
    void runPrompt(example);
  };

  const clearPrompt = () => {
    requestRef.current += 1;
    setDraft("");
    setSubmittedPrompt("");
    setResult(null);
    setMatching(false);
    setStatus("");
    setError("");
  };

  const visibleMatches = result?.matches.slice(0, resultLimit) ?? [];
  const reasons = new Map(visibleMatches.map((match) => [match.item.key, match.reason]));
  const items = visibleMatches.map((match) => match.item);

  return (
    <section className="prompt-recommender" aria-labelledby="prompt-recommender-heading">
      <div className="prompt-recommender-heading">
        <div className="prompt-recommender-icon"><SearchIcon /></div>
        <div>
          <span className="eyebrow">LOCAL PROMPT MATCHING</span>
          <h2 id="prompt-recommender-heading">Describe tonight&apos;s watch</h2>
          <p>Write naturally. Watchmaker understands the complete sentence locally, makes the story subject most important, and treats tone and ratings as supporting signals.</p>
        </div>
      </div>

      <form className="prompt-recommender-form" onSubmit={submit}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          maxLength={500}
          rows={3}
          disabled={matching}
          placeholder="Try: A funny zombie movie with a group of friends, but no romance…"
          aria-label="Describe what you want to watch"
        />
        <div className="prompt-form-footer">
          <span>{draft.length}/500 · Ctrl + Enter to search</span>
          <div>
            {(draft || submittedPrompt) && (
              <button
                className="text-link"
                type="button"
                onClick={clearPrompt}
              >
                Clear
              </button>
            )}
            <button className="primary-button" type="submit" disabled={draft.trim().length < 3 || matching}>
              {matching ? "Understanding…" : "Find my watch"} <SearchIcon />
            </button>
          </div>
        </div>
      </form>

      {!submittedPrompt && (
        <div className="prompt-examples" aria-label="Example prompts">
          <span>Try one:</span>
          {EXAMPLES.map((example) => (
            <button type="button" key={example} onClick={() => useExample(example)}>{example}</button>
          ))}
        </div>
      )}

      {matching && (
        <div className="prompt-inline-message prompt-loading" aria-live="polite">
          <span className="status-dot syncing" />
          {status || "Understanding the complete request on this PC…"}
        </div>
      )}

      {error && !matching && (
        <div className="prompt-inline-message prompt-error" role="alert">
          The bundled local understanding model could not run. {error}
        </div>
      )}

      {result && !matching && (
        <div className="prompt-results">
          <div className="prompt-reading">
            <strong>Watchmaker understood:</strong>
            {result.semantic && <span className="prompt-chip semantic">Whole-prompt meaning</span>}
            {result.referencedTitles.map((title) => (
              <span className="prompt-chip reference" key={`title:${title}`}>Like {title}</span>
            ))}
            {result.format && <span className="prompt-chip">Format: {formatLabel(result.format)}</span>}
            {result.coreIdeas.map((idea) => (
              <span className="prompt-chip primary" key={`core:${idea}`}>Story first: {idea}</span>
            ))}
            {result.moodIdeas.map((idea) => (
              <span className="prompt-chip modifier" key={`mood:${idea}`}>Tone: {idea}</span>
            ))}
            {result.excludedKeywords.map((keyword) => (
              <span className="prompt-chip excluded" key={`avoid:${keyword}`}>No {keyword}</span>
            ))}
          </div>

          {!result.meaningful ? (
            <div className="prompt-inline-message">
              Give me a little more detail—try a mood, story idea, format, or title you already like.
            </div>
          ) : result.matches.length === 0 ? (
            <div className="prompt-inline-message">
              Nothing included matched that combination. Remove one restriction and try again.
            </div>
          ) : (
            <>
              <div className="collection-result-heading prompt-result-heading">
                <div>
                  <h3>Your prompt matches</h3>
                  <p>{result.matches.length.toLocaleString()} included titles compared locally</p>
                </div>
              </div>
              <MediaGrid
                items={items}
                reasons={reasons}
                onOpen={onOpen}
                watchlist={watchlist}
                onToggleWatchlist={onToggleWatchlist}
                tasteSignals={tasteSignals}
                onTasteSignal={onTasteSignal}
              />
              {result.matches.length > resultLimit && (
                <div className="load-more-row">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setResultLimit((current) => current + 6)}
                  >
                    Show more prompt matches
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
