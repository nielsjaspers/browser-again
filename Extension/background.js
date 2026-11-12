(() => {
  // Extension/session.js
  var WAIT_MS = 1e4;
  var PASS_MS = 5 * 60000;
  function createSessionController(storage, now = Date.now) {
    let queue = Promise.resolve();
    function request(action) {
      const result = queue.then(async () => {
        const saved = await storage.get();
        let state = saved && Number.isFinite(saved.readyAt) && Number.isFinite(saved.expiresAt) ? saved : { readyAt: 0, expiresAt: 0 };
        const time = now();
        if (state.expiresAt && state.expiresAt <= time)
          state = { readyAt: 0, expiresAt: 0 };
        if (state.expiresAt > time)
          return state;
        if (action === "begin" && !state.readyAt)
          state = { readyAt: time + WAIT_MS, expiresAt: 0 };
        if (action === "emergency" || action === "open" && state.readyAt && time >= state.readyAt) {
          state = { readyAt: 0, expiresAt: time + PASS_MS };
        }
        if (state.readyAt !== saved?.readyAt || state.expiresAt !== saved?.expiresAt)
          await storage.set(state);
        return state;
      });
      queue = result.catch(() => {});
      return result;
    }
    return { request };
  }

  // scripts/background.js
  var session = createSessionController({
    async get() {
      return (await browser.storage.local.get("youtubeSession")).youtubeSession;
    },
    async set(state) {
      await browser.storage.local.set({ youtubeSession: state });
    }
  });
  var gateURL = browser.runtime.getURL("youtube.html");
  var isYouTube = (url) => {
    try {
      const { hostname, protocol } = new URL(url);
      return /^https?:$/.test(protocol) && ["youtube.com", "youtu.be", "youtube-nocookie.com"].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
    } catch {
      return false;
    }
  };
  browser.runtime.onMessage.addListener((message, sender) => {
    if (message?.type !== "youtube-session")
      return;
    const action = message.action;
    if (!["status", "begin", "open", "emergency"].includes(action))
      return;
    if (action !== "status" && sender.url?.split(/[?#]/)[0] !== gateURL)
      return;
    return session.request(action).then(async (state) => {
      if (state.expiresAt > Date.now())
        await browser.alarms.create("youtube-expiry", { when: state.expiresAt });
      return state;
    });
  });
  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== "youtube-expiry")
      return;
    const state = await session.request("status");
    if (state.expiresAt > Date.now())
      return;
    const tabs = await browser.tabs.query({});
    await Promise.allSettled(tabs.filter((tab) => tab.id !== undefined && isYouTube(tab.url)).map((tab) => browser.tabs.update(tab.id, { url: `${gateURL}#${encodeURIComponent(tab.url)}` })));
  });
})();
