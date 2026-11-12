import { CUSTOM_RULE_IDS, createCustomSitesController } from "./custom-sites.js";
import { createSessionController } from "../Extension/session.js";

const session = createSessionController({
  async get() { return (await browser.storage.local.get("youtubeSession")).youtubeSession; },
  async set(state) { await browser.storage.local.set({ youtubeSession: state }); }
});
const gateURL = browser.runtime.getURL("youtube.html");
const isYouTube = url => {
  try {
    const { hostname, protocol } = new URL(url);
    return /^https?:$/.test(protocol) && ["youtube.com", "youtu.be", "youtube-nocookie.com"]
      .some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch { return false; }
};

browser.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "youtube-session") return;
  const action = message.action;
  if (!["status", "begin", "open", "emergency"].includes(action)) return;
  // Only the extension's confirmation page can grant access.
  if (action !== "status" && sender.url?.split(/[?#]/)[0] !== gateURL) return;
  return session.request(action).then(async state => {
    if (state.expiresAt > Date.now()) await browser.alarms.create("youtube-expiry", { when: state.expiresAt });
    return state;
  });
});

browser.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== "youtube-expiry") return;
  const state = await session.request("status");
  if (state.expiresAt > Date.now()) return;
  const tabs = await browser.tabs.query({});
  await Promise.allSettled(tabs.filter(tab => tab.id !== undefined && isYouTube(tab.url)).map(tab =>
    browser.tabs.update(tab.id, { url: `${gateURL}#${encodeURIComponent(tab.url)}` })
  ));
});

const sitesURL = browser.runtime.getURL("sites.html");
const customSites = createCustomSitesController({
  async get() { return (await browser.storage.local.get("customSites")).customSites; },
  async set(hosts) { await browser.storage.local.set({ customSites: hosts }); }
}, addRules => browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds: CUSTOM_RULE_IDS, addRules }), async hosts => {
  const tabs = await browser.tabs.query({});
  const matches = url => {
    try {
      const parsed = new URL(url);
      return /^https?:$/.test(parsed.protocol) && hosts.some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
    } catch { return false; }
  };
  await Promise.allSettled(tabs.filter(tab => tab.id !== undefined && matches(tab.url)).map(tab => browser.tabs.update(tab.id, { url: browser.runtime.getURL("blocked.html") })));
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "custom-sites" || sender.url?.split(/[?#]/)[0] !== sitesURL) return;
  if (!["list", "add", "remove"].includes(message.action)) return;
  return customSites.request(message.action, message.site)
    .then(sites => ({ sites }), error => ({ error: error.message || "Could not save your sites." }));
});
browser.runtime.onInstalled.addListener(() => customSites.request("restore"));
browser.runtime.onStartup.addListener(() => customSites.request("restore"));
