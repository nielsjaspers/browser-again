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
