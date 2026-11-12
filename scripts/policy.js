import builtInSites from "../Extension/hosts.json";

export const YOUTUBE_HOSTS = ["youtube.com", "youtu.be", "youtube-nocookie.com"];
export function hostnameFromURL(value) {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url.hostname.toLowerCase().replace(/\.$/, "") : null;
  } catch { return null; }
}
export function matchesHost(hostname, site) {
  return hostname === site.host || (site.includeSubdomains && hostname.endsWith(`.${site.host}`));
}
// Existing entries remain permanent blocks with subdomains included.
export function readSites(value) {
  return Array.isArray(value) ? value.map(site => typeof site === "string"
    ? { host: site, includeSubdomains: true, mode: "block" }
    : site).filter(site => site && typeof site.host === "string" && typeof site.includeSubdomains === "boolean" && ["block", "timed"].includes(site.mode)) : [];
}
export function findPolicy(value, sites) {
  const hostname = hostnameFromURL(value);
  if (!hostname) return null;
  if (YOUTUBE_HOSTS.some(host => matchesHost(hostname, { host, includeSubdomains: true }))) return { key: "youtube", label: "YouTube", mode: "timed" };
  if (builtInSites.some(host => matchesHost(hostname, { host, includeSubdomains: true }))) return { key: hostname, label: hostname, mode: "block" };
  const site = readSites(sites).filter(site => matchesHost(hostname, site)).sort((a, b) => b.host.length - a.host.length)[0];
  return site ? { key: site.host, label: site.host, mode: site.mode } : null;
}
