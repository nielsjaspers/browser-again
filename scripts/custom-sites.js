import builtInSites from "../Extension/hosts.json";
import { readSites } from "./policy.js";

export function normalizeSite(input, includeSubdomains = true) {
  if (typeof input !== "string" || !input.trim()) throw new Error("Enter a domain or website URL.");
  const text = input.trim();
  let url;
  try { url = new URL(text.includes("://") ? text : `https://${text}`); }
  catch { throw new Error("Enter a valid domain or website URL."); }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error("Use an HTTP or HTTPS website without login details.");
  let host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (includeSubdomains) host = host.replace(/^www\./, "");
  const labels = host.split(".");
  if (host !== "localhost" && (labels.length < 2 || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))) throw new Error("Enter a full domain, such as linkedin.com.");
  if (builtInSites.some(site => host === site || host.endsWith(`.${site}`))) throw new Error("This site is already included in the built-in rules.");
  return host;
}
export function customRules(sites) {
  return readSites(sites).flatMap((site, index) => {
    const match = site.includeSubdomains ? { requestDomains: [site.host] }
      : { regexFilter: `^https?://${site.host.replaceAll(".", "\\.")}(:[0-9]+)?/` };
    const priority = 10 + site.host.split(".").length * 2 + (site.includeSubdomains ? 0 : 1);
    if (site.mode === "timed") return [{ id: 100 + index * 2, priority, action: { type: "allow" }, condition: match }];
    return [
      { id: 100 + index * 2, priority, action: { type: "redirect", redirect: { extensionPath: "/blocked.html" } }, condition: { ...match, resourceTypes: ["main_frame"] } },
      { id: 101 + index * 2, priority, action: { type: "block" }, condition: { ...match, resourceTypes: ["sub_frame", "stylesheet", "script", "image", "font", "xmlhttprequest", "ping", "media", "websocket", "other"] } }
    ];
  });
}
export function createCustomSitesController(storage, applyRules, updateTabs) {
  let queue = Promise.resolve();
  function request(action, input) {
    const result = queue.then(async () => {
      const sites = readSites(await storage.get());
      if (action === "list") return sites;
      let next = sites;
      if (action === "add") {
        if (!input || typeof input.includeSubdomains !== "boolean" || !["block", "timed"].includes(input.mode)) throw new Error("Choose a valid blocking mode.");
        const site = { host: normalizeSite(input.host, input.includeSubdomains), includeSubdomains: input.includeSubdomains, mode: input.mode };
        next = [...sites.filter(saved => saved.host !== site.host), site].sort((a, b) => a.host.localeCompare(b.host));
      }
      if (action === "remove") next = sites.filter(site => site.host !== input);
      await applyRules(customRules(next));
      try { await storage.set(next); }
      catch (error) { await applyRules(customRules(sites)); throw error; }
      if (action === "add") await updateTabs(next);
      return next;
    });
    queue = result.catch(() => {});
    return result;
  }
  return { request };
}
