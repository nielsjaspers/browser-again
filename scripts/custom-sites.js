import builtInSites from "../Extension/hosts.json";

export const CUSTOM_RULE_IDS = [100, 101];

export function normalizeSite(input) {
  if (typeof input !== "string" || !input.trim()) throw new Error("Enter a domain or website URL.");
  const text = input.trim();
  let url;
  try { url = new URL(text.includes("://") ? text : `https://${text}`); }
  catch { throw new Error("Enter a valid domain or website URL."); }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error("Use an HTTP or HTTPS website without login details.");
  const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  const labels = host.split(".");
  if (host !== "localhost" && (labels.length < 2 || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))) {
    throw new Error("Enter a full domain, such as reddit.com.");
  }
  if (builtInSites.some(site => host === site || host.endsWith(`.${site}`))) throw new Error("This site is already included in the built-in rules.");
  return host;
}

export function customRules(hosts) {
  if (!hosts.length) return [];
  return [
    { id: 100, priority: 1, action: { type: "redirect", redirect: { extensionPath: "/blocked.html" } }, condition: { requestDomains: hosts, resourceTypes: ["main_frame"] } },
    { id: 101, priority: 1, action: { type: "block" }, condition: { requestDomains: hosts, resourceTypes: ["sub_frame", "stylesheet", "script", "image", "font", "xmlhttprequest", "ping", "media", "websocket", "other"] } }
  ];
}

export function createCustomSitesController(storage, applyRules, closeTabs) {
  let queue = Promise.resolve();
  function request(action, input) {
    const result = queue.then(async () => {
      const saved = await storage.get();
      const hosts = Array.isArray(saved) ? saved : [];
      if (action === "list") return hosts;
      let next = hosts;
      if (action === "add") next = [...new Set([...hosts, normalizeSite(input)])].sort();
      if (action === "remove") next = hosts.filter(host => host !== input);
      await applyRules(customRules(next));
      try { await storage.set(next); }
      catch (error) { await applyRules(customRules(hosts)); throw error; }
      if (action === "add") await closeTabs(next);
      return next;
    });
    queue = result.catch(() => {});
    return result;
  }
  return { request };
}
