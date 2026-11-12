import hosts from "../Extension/hosts.json";

const permanentHosts = hosts.filter(host => !["youtube.com", "youtu.be", "youtube-nocookie.com"].includes(host));
const action = { type: "redirect", redirect: { extensionPath: "/blocked.html" } };
const rules = [
  { id: 1, priority: 10000, action, condition: { requestDomains: permanentHosts, resourceTypes: ["main_frame"] } },
  { id: 2, priority: 10000, action: { type: "block" }, condition: { requestDomains: permanentHosts, resourceTypes: ["sub_frame", "media", "xmlhttprequest", "script", "image", "ping", "websocket", "other"] } },
  // Nitter instances often keep a nitter or nitter-* DNS label.
  { id: 3, priority: 10000, action, condition: { regexFilter: "^https?://([^/]+\\.)?nitter([.-][a-z0-9-]+)*\\.[a-z]+(:[0-9]+)?/", resourceTypes: ["main_frame"] } }
];
await Bun.write(new URL("../Extension/rules.json", import.meta.url), JSON.stringify(rules, null, 2) + "\n");
