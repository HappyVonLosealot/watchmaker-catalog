import { DatabaseIcon, SettingsIcon } from "./Icons";

interface EmptyStateProps {
  configured: boolean;
  onSettings: () => void;
  title?: string;
  detail?: string;
}

export function EmptyState({ configured, onSettings, title, detail }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{configured ? <DatabaseIcon /> : <SettingsIcon />}</div>
      <h2>{title ?? (configured ? "Your catalogue is winding up" : "Set your watch services")}</h2>
      <p>
        {detail ??
          (configured
            ? "The catalogue refresh is running. Titles appear here as each service finishes."
            : "Choose the subscriptions you already pay for. No account or API key is required.")}
      </p>
      {!configured && (
        <button className="primary-button" type="button" onClick={onSettings}>Open setup</button>
      )}
    </div>
  );
}
