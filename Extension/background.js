(() => {
  // Extension/hosts.json
  var hosts_default = [
    "youtube.com",
    "youtu.be",
    "youtube-nocookie.com",
    "news.ycombinator.com",
    "x.com",
    "twitter.com",
    "nitter.net",
    "xcancel.com",
    "twiiit.com",
    "nitter.poast.org",
    "nitter.privacyredirect.com",
    "nitter.tiekoetter.com",
    "nuku.trabun.org",
    "nitter.catsarch.com",
    "nitter.kareem.one",
    "nitter.privacydev.net",
    "nitter.space"
  ];

  // scripts/custom-sites.js
  var CUSTOM_RULE_IDS = [100, 101];
  function normalizeSite(input) {
    if (typeof input !== "string" || !input.trim())
      throw new Error("Enter a domain or website URL.");
    const text = input.trim();
    let url;
    try {
      url = new URL(text.includes("://") ? text : `https://${text}`);
    } catch {
      throw new Error("Enter a valid domain or website URL.");
    }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password)
      throw new Error("Use an HTTP or HTTPS website without login details.");
    const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
    const labels = host.split(".");
    if (host !== "localhost" && (labels.length < 2 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))) {
      throw new Error("Enter a full domain, such as reddit.com.");
    }
    if (hosts_default.some((site) => host === site || host.endsWith(`.${site}`)))
      throw new Error("This site is already included in the built-in rules.");
    return host;
  }
  function customRules(hosts) {
    if (!hosts.length)
      return [];
    return [
      { id: 100, priority: 1, action: { type: "redirect", redirect: { extensionPath: "/blocked.html" } }, condition: { requestDomains: hosts, resourceTypes: ["main_frame"] } },
      { id: 101, priority: 1, action: { type: "block" }, condition: { requestDomains: hosts, resourceTypes: ["sub_frame", "stylesheet", "script", "image", "font", "xmlhttprequest", "ping", "media", "websocket", "other"] } }
    ];
  }
  function createCustomSitesController(storage, applyRules, closeTabs) {
    let queue = Promise.resolve();
    function request(action, input) {
      const result = queue.then(async () => {
        const saved = await storage.get();
        const hosts = Array.isArray(saved) ? saved : [];
        if (action === "list")
          return hosts;
        let next = hosts;
        if (action === "add")
          next = [...new Set([...hosts, normalizeSite(input)])].sort();
        if (action === "remove")
          next = hosts.filter((host) => host !== input);
        await applyRules(customRules(next));
        try {
          await storage.set(next);
        } catch (error) {
          await applyRules(customRules(hosts));
          throw error;
        }
        if (action === "add")
          await closeTabs(next);
        return next;
      });
      queue = result.catch(() => {});
      return result;
    }
    return { request };
  }

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
  var sitesURL = browser.runtime.getURL("sites.html");
  var customSites = createCustomSitesController({
    async get() {
      return (await browser.storage.local.get("customSites")).customSites;
    },
    async set(hosts) {
      await browser.storage.local.set({ customSites: hosts });
    }
  }, (addRules) => browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds: CUSTOM_RULE_IDS, addRules }), async (hosts) => {
    const tabs = await browser.tabs.query({});
    const matches = (url) => {
      try {
        const parsed = new URL(url);
        return /^https?:$/.test(parsed.protocol) && hosts.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
      } catch {
        return false;
      }
    };
    await Promise.allSettled(tabs.filter((tab) => tab.id !== undefined && matches(tab.url)).map((tab) => browser.tabs.update(tab.id, { url: browser.runtime.getURL("blocked.html") })));
  });
  browser.runtime.onMessage.addListener((message, sender) => {
    if (message?.type !== "custom-sites" || sender.url?.split(/[?#]/)[0] !== sitesURL)
      return;
    if (!["list", "add", "remove"].includes(message.action))
      return;
    return customSites.request(message.action, message.site).then((sites) => ({ sites }), (error) => ({ error: error.message || "Could not save your sites." }));
  });
  browser.runtime.onInstalled.addListener(() => customSites.request("restore"));
  browser.runtime.onStartup.addListener(() => customSites.request("restore"));
})();
