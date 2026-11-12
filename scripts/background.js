import { createCustomSitesController } from "./custom-sites.js";
import { createSessionController } from "./session.js";
import { findPolicy, hostnameFromURL } from "./policy.js";

const gateURL = browser.runtime.getURL("gate.html");
const sitesURL = browser.runtime.getURL("sites.html");
const session = createSessionController({
  async get() { return browser.storage.local.get(["siteSessions", "siteOpenings", "siteCooldowns"]); },
  async set(value) { await browser.storage.local.set(value); }
});
const gateFor = url => `${gateURL}#${encodeURIComponent(url)}`;
const isPage = (sender, url) => sender.url?.split(/[?#]/)[0] === url;
const readCustom = async () => (await browser.storage.local.get("customSites")).customSites;

const customSites = createCustomSitesController({
  get: readCustom,
  async set(sites) { await browser.storage.local.set({ customSites: sites }); }
}, async addRules => {
  const existing = await browser.declarativeNetRequest.getDynamicRules();
  await browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing.filter(rule => rule.id >= 100).map(rule => rule.id), addRules });
}, async sites => {
  const tabs = await browser.tabs.query({});
  await Promise.allSettled(tabs.filter(tab => tab.id !== undefined && tab.url).map(async tab => {
    const policy = findPolicy(tab.url, sites);
    if (!policy) return;
    if (policy.mode === "block") await browser.tabs.update(tab.id, { url: browser.runtime.getURL("blocked.html") });
    else {
      const state = await session.request(policy.key, "status", tab.id);
      if (state.expiresAt <= Date.now()) await browser.tabs.update(tab.id, { url: gateFor(tab.url) });
    }
  }));
});

async function handleSession(message, sender) {
  const trustedGate = isPage(sender, gateURL);
  if (!["status", "begin", "open", "emergency", "close"].includes(message.action)) throw new Error("Unknown action.");
  if (message.action !== "status" && !trustedGate) throw new Error("Open the access screen first.");
  const url = trustedGate ? message.url : sender.url;
  const policy = findPolicy(url, await readCustom());
  const tabId = sender.tab?.id ?? (trustedGate && Number.isInteger(message.tabId) ? message.tabId : undefined);
  if (trustedGate && Number.isInteger(tabId)) {
    const tab = await browser.tabs.get(tabId);
    if (tab.url?.split(/[?#]/)[0] !== gateURL) throw new Error("Open the access screen first.");
  }
  if (message.action === "close") {
    if (!Number.isInteger(tabId)) throw new Error("Close this tab using Safari’s tab controls.");
    if (policy?.mode === "timed") await session.request(policy.key, "close", tabId, true);
    else await session.removeTab(tabId);
    await browser.tabs.remove(tabId);
    return { closed: true };
  }
  if (!policy || policy.mode !== "timed") return { policy };
  const state = await session.request(policy.key, message.action, tabId, trustedGate);
  if (state.expiresAt > Date.now()) await browser.alarms.create(`site-expiry:${policy.key}`, { when: state.expiresAt });
  return { policy, state };
}

browser.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "site-session") return handleSession(message, sender).catch(error => ({ error: error.message }));
  if (message?.type !== "custom-sites" || !isPage(sender, sitesURL)) return;
  if (!["list", "add", "remove"].includes(message.action)) return;
  return customSites.request(message.action, message.site).then(async sites => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return { sites, currentHost: hostnameFromURL(tab?.url) };
  }).catch(error => ({ error: error.message || "Could not save your sites." }));
});

browser.alarms.onAlarm.addListener(async alarm => {
  if (!alarm.name.startsWith("site-expiry:")) return;
  const key = alarm.name.slice("site-expiry:".length);
  const state = await session.request(key, "status");
  if (state.expiresAt > Date.now()) return;
  const sites = await readCustom();
  const tabs = await browser.tabs.query({});
  await Promise.allSettled(tabs.filter(tab => tab.id !== undefined && findPolicy(tab.url, sites)?.key === key)
    .map(tab => browser.tabs.update(tab.id, { url: gateFor(tab.url) })));
});
browser.tabs.onRemoved.addListener(tabId => session.removeTab(tabId));
browser.tabs.onUpdated.addListener((tabId, change) => {
  if (!change.url) return;
  if (change.url.startsWith(gateURL + "#")) {
    let target;
    try { target = decodeURIComponent(change.url.slice(gateURL.length + 1)); } catch { return; }
    readCustom().then(async sites => {
      const policy = findPolicy(target, sites);
      await session.removeTab(tabId, policy?.mode === "timed" ? policy.key : undefined);
      if (policy?.mode === "timed") return session.request(policy.key, "status", tabId, true);
    }).catch(() => {});
    return;
  }
  readCustom().then(async sites => {
    const policy = findPolicy(change.url, sites);
    await session.removeTab(tabId, policy?.mode === "timed" ? policy.key : undefined);
    if (policy?.mode !== "timed") return;
    const state = await session.request(policy.key, "status", tabId);
    if (state.expiresAt > Date.now()) return;
    const tab = await browser.tabs.get(tabId);
    if ((tab.pendingUrl || tab.url) === change.url) await browser.tabs.update(tabId, { url: gateFor(change.url) });
  }).catch(() => {});
});
async function restore() {
  await customSites.request("restore");
  await browser.storage.local.remove("youtubeSession");
}
browser.runtime.onInstalled.addListener(restore);
browser.runtime.onStartup.addListener(() => customSites.request("restore"));
