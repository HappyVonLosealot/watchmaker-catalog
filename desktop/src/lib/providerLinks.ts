import { openUrl } from "@tauri-apps/plugin-opener";
import type { CatalogItem, CustomSite, ProviderLink } from "../types";

const ALLOWED_EXTERNAL_HOSTS = new Set([
  "www.netflix.com",
  "www.primevideo.com",
  "www.disneyplus.com",
  "play.max.com",
  "www.dropout.tv",
  "www.google.com",
  "www.themoviedb.org",
]);

export function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname)
    );
  } catch {
    return false;
  }
}

export function isSafeCustomUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export function validateCustomSite(site: Omit<CustomSite, "id">): string | null {
  if (!site.name.trim()) return "Give the streaming site a name.";
  if (!isSafeCustomUrl(site.homeUrl.trim())) return "The website must be a valid HTTPS address.";
  if (site.searchUrlTemplate.trim()) {
    if (!site.searchUrlTemplate.includes("{query}")) {
      return "The search address must contain {query} where the title belongs.";
    }
    const sampleUrl = site.searchUrlTemplate.split("{query}").join("watchmaker");
    if (!isSafeCustomUrl(sampleUrl)) return "The search address must be a valid HTTPS address.";
  }
  return null;
}

export function providerSearchUrl(providerName: string, title: string): string {
  const name = providerName.toLocaleLowerCase("en-US");
  const query = encodeURIComponent(title);

  if (name.includes("netflix")) return `https://www.netflix.com/search?q=${query}`;
  if (name.includes("amazon") || name.includes("prime video")) {
    return `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${query}`;
  }
  if (name.includes("disney")) return `https://www.disneyplus.com/search?q=${query}`;
  if (name === "max" || name.includes("hbo max")) {
    return `https://play.max.com/search?q=${query}`;
  }
  if (name.includes("dropout")) return `https://www.dropout.tv/search?q=${query}`;

  return `https://www.google.com/search?q=${encodeURIComponent(
    `${title} watch on ${providerName}`,
  )}`;
}

export function resolveProviderUrl(item: CatalogItem, link: ProviderLink): string {
  return link.url && isAllowedExternalUrl(link.url)
    ? link.url
    : providerSearchUrl(link.providerName, item.title);
}

async function openHttpsUrl(url: string): Promise<void> {
  if ("__TAURI_INTERNALS__" in window) {
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function openProvider(item: CatalogItem, link: ProviderLink): Promise<void> {
  const url = resolveProviderUrl(item, link);
  if (!isAllowedExternalUrl(url)) throw new Error("Watchmaker blocked an unapproved provider URL.");
  await openHttpsUrl(url);
}

export async function openExternal(url: string): Promise<void> {
  if (!isAllowedExternalUrl(url)) throw new Error("Watchmaker blocked an unapproved external URL.");
  await openHttpsUrl(url);
}

export function resolveCustomSiteUrl(site: CustomSite, title: string): string {
  const validationError = validateCustomSite(site);
  if (validationError) throw new Error(validationError);
  return site.searchUrlTemplate.trim()
    ? site.searchUrlTemplate.split("{query}").join(encodeURIComponent(title))
    : site.homeUrl.trim();
}

export async function openCustomSite(site: CustomSite, title: string): Promise<void> {
  const url = resolveCustomSiteUrl(site, title);
  if (!isSafeCustomUrl(url)) throw new Error("Watchmaker blocked an unsafe custom-site URL.");
  await openHttpsUrl(url);
}

export async function openCustomHome(site: CustomSite): Promise<void> {
  if (!isSafeCustomUrl(site.homeUrl)) throw new Error("Watchmaker blocked an unsafe custom-site URL.");
  await openHttpsUrl(site.homeUrl);
}
