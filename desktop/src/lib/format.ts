export function formatSyncTime(timestamp: number | null): string {
  if (!timestamp) return "Not synced yet";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

export function releaseYear(date: string): string {
  return date.slice(0, 4) || "—";
}

export function compactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}
