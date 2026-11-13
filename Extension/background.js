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

  // scripts/policy.js
  var YOUTUBE_HOSTS = ["youtube.com", "youtu.be", "youtube-nocookie.com"];
  function hostnameFromURL(value) {
    try {
      const url = new URL(value);
      return /^https?:$/.test(url.protocol) ? url.hostname.toLowerCase().replace(/\.$/, "") : null;
    } catch {
      return null;
    }
  }
  function matchesHost(hostname, site) {
    return hostname === site.host || site.includeSubdomains && hostname.endsWith(`.${site.host}`);
  }
  function readSites(value) {
    return Array.isArray(value) ? value.map((site) => typeof site === "string" ? { host: site, includeSubdomains: true, mode: "block" } : site).filter((site) => site && typeof site.host === "string" && typeof site.includeSubdomains === "boolean" && ["block", "timed"].includes(site.mode)) : [];
  }
  function findPolicy(value, sites) {
    const hostname = hostnameFromURL(value);
    if (!hostname)
      return null;
    if (YOUTUBE_HOSTS.some((host) => matchesHost(hostname, { host, includeSubdomains: true })))
      return { key: "youtube", label: "YouTube", mode: "timed" };
    if (hosts_default.some((host) => matchesHost(hostname, { host, includeSubdomains: true })))
      return { key: hostname, label: hostname, mode: "block" };
    const site = readSites(sites).filter((site2) => matchesHost(hostname, site2)).sort((a, b) => b.host.length - a.host.length)[0];
    return site ? { key: site.host, label: site.host, mode: site.mode } : null;
  }

  // scripts/custom-sites.js
  function normalizeSite(input, includeSubdomains = true) {
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
    let host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (includeSubdomains)
      host = host.replace(/^www\./, "");
    const labels = host.split(".");
    if (host !== "localhost" && (labels.length < 2 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))))
      throw new Error("Enter a full domain, such as linkedin.com.");
    if (hosts_default.some((site) => host === site || host.endsWith(`.${site}`)))
      throw new Error("This site is already included in the built-in rules.");
    return host;
  }
  function customRules(sites) {
    return readSites(sites).flatMap((site, index) => {
      const match = site.includeSubdomains ? { requestDomains: [site.host] } : { regexFilter: `^https?://${site.host.replaceAll(".", "\\.")}(:[0-9]+)?/` };
      const priority = 10 + site.host.split(".").length * 2 + (site.includeSubdomains ? 0 : 1);
      if (site.mode === "timed")
        return [{ id: 100 + index * 2, priority, action: { type: "allow" }, condition: match }];
      return [
        { id: 100 + index * 2, priority, action: { type: "redirect", redirect: { extensionPath: "/blocked.html" } }, condition: { ...match, resourceTypes: ["main_frame"] } },
        { id: 101 + index * 2, priority, action: { type: "block" }, condition: { ...match, resourceTypes: ["sub_frame", "stylesheet", "script", "image", "font", "xmlhttprequest", "ping", "media", "websocket", "other"] } }
      ];
    });
  }
  function createCustomSitesController(storage, applyRules, updateTabs) {
    let queue = Promise.resolve();
    function request(action, input) {
      const result = queue.then(async () => {
        const sites = readSites(await storage.get());
        if (action === "list")
          return sites;
        let next = sites;
        if (action === "add") {
          if (!input || typeof input.includeSubdomains !== "boolean" || !["block", "timed"].includes(input.mode))
            throw new Error("Choose a valid blocking mode.");
          const site = { host: normalizeSite(input.host, input.includeSubdomains), includeSubdomains: input.includeSubdomains, mode: input.mode };
          next = [...sites.filter((saved) => saved.host !== site.host), site].sort((a, b) => a.host.localeCompare(b.host));
        }
        if (action === "remove")
          next = sites.filter((site) => site.host !== input);
        await applyRules(customRules(next));
        try {
          await storage.set(next);
        } catch (error) {
          await applyRules(customRules(sites));
          throw error;
        }
        if (action === "add")
          await updateTabs(next);
        return next;
      });
      queue = result.catch(() => {});
      return result;
    }
    return { request };
  }

  // scripts/session.js
  var BREATH_MS = 7000;
  var PASS_MS = 5 * 60000;
  var EMERGENCY_MS = 15 * 60000;
  var COOLDOWN_MS = 60 * 60000;
  var DAY_MS = 24 * 60 * 60000;
  var fresh = () => ({ readyAt: 0, expiresAt: 0, cycle: 0, tabs: [], gateTabs: [] });
  function createSessionController(storage, now = Date.now) {
    let queue = Promise.resolve();
    function enqueue(task) {
      const result = queue.then(task);
      queue = result.catch(() => {});
      return result;
    }
    function request(key, action, tabId, atGate = false) {
      return enqueue(async () => {
        const { siteSessions: saved = {}, siteOpenings: history = {}, siteCooldowns: savedCooldowns = {} } = await storage.get();
        const time = now();
        const openings = Object.fromEntries(Object.entries(history).map(([site, times]) => [site, times.filter((at) => at > time - DAY_MS && at <= time)]).filter(([, times]) => times.length));
        const cooldowns = Object.fromEntries(Object.entries(savedCooldowns).filter(([, readyAt]) => readyAt > time));
        const result = (state2) => ({ ...state2, opens24h: (openings[key] || []).length, emergencyReadyAt: cooldowns[key] || 0 });
        let state = saved[key] || fresh();
        state = { ...state, gateTabs: state.gateTabs || [] };
        if (Number.isInteger(tabId) && !state.tabs.includes(tabId))
          state = { ...state, tabs: [...state.tabs, tabId] };
        if (action === "close") {
          const next = { ...saved };
          delete next[key];
          await storage.set({ siteSessions: next, siteOpenings: openings, siteCooldowns: cooldowns });
          return result(fresh());
        }
        if (state.expiresAt <= time) {
          state = { ...state, expiresAt: 0 };
          if (action === "begin" && !state.readyAt)
            state.readyAt = time + BREATH_MS;
          if (action === "emergency" && state.cycle === 0)
            throw new Error("Complete your first breathing cycle before using Emergency.");
          if (action === "emergency" && cooldowns[key])
            throw new Error("Emergency is unavailable during its one-hour cooldown.");
          if (action === "emergency" && (!state.readyAt || time < state.readyAt))
            throw new Error("Complete the breathing cycle before using Emergency.");
          if (action === "emergency" || action === "open" && state.readyAt > 0 && time >= state.readyAt) {
            state = { ...state, readyAt: 0, expiresAt: time + (action === "emergency" ? EMERGENCY_MS : PASS_MS), cycle: state.cycle + 1 };
            if (action === "emergency")
              cooldowns[key] = state.expiresAt + COOLDOWN_MS;
            openings[key] = [...openings[key] || [], time];
          }
        }
        if (Number.isInteger(tabId)) {
          const staysAtGate = atGate && !(state.expiresAt > time && ["open", "emergency"].includes(action));
          const gateTabs = staysAtGate ? state.gateTabs.includes(tabId) ? state.gateTabs : [...state.gateTabs, tabId] : state.gateTabs.filter((id) => id !== tabId);
          state = { ...state, gateTabs };
        }
        const changes = {};
        if (JSON.stringify(saved[key]) !== JSON.stringify(state))
          changes.siteSessions = { ...saved, [key]: state };
        if (JSON.stringify(history) !== JSON.stringify(openings))
          changes.siteOpenings = openings;
        if (JSON.stringify(savedCooldowns) !== JSON.stringify(cooldowns))
          changes.siteCooldowns = cooldowns;
        if (Object.keys(changes).length)
          await storage.set(changes);
        return result(state);
      });
    }
    function removeTab(tabId, exceptKey) {
      return enqueue(async () => {
        const { siteSessions: saved = {} } = await storage.get();
        const next = {};
        for (const [key, state] of Object.entries(saved)) {
          if (key !== exceptKey && state.gateTabs?.includes(tabId))
            continue;
          const tabs = key === exceptKey ? state.tabs : state.tabs.filter((id) => id !== tabId);
          if (tabs.length)
            next[key] = { ...state, tabs, gateTabs: (state.gateTabs || []).filter((id) => tabs.includes(id)) };
        }
        await storage.set({ siteSessions: next });
      });
    }
    return { request, removeTab };
  }

  // scripts/background.js
  var gateURL = browser.runtime.getURL("gate.html");
  var sitesURL = browser.runtime.getURL("sites.html");
  var session = createSessionController({
    async get() {
      return browser.storage.local.get(["siteSessions", "siteOpenings", "siteCooldowns"]);
    },
    async set(value) {
      await browser.storage.local.set(value);
    }
  });
  var gateFor = (url) => `${gateURL}#${encodeURIComponent(url)}`;
  var isPage = (sender, url) => sender.url?.split(/[?#]/)[0] === url;
  var readCustom = async () => (await browser.storage.local.get("customSites")).customSites;
  var customSites = createCustomSitesController({
    get: readCustom,
    async set(sites) {
      await browser.storage.local.set({ customSites: sites });
    }
  }, async (addRules) => {
    const existing = await browser.declarativeNetRequest.getDynamicRules();
    await browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing.filter((rule) => rule.id >= 100).map((rule) => rule.id), addRules });
  }, async (sites) => {
    const tabs = await browser.tabs.query({});
    await Promise.allSettled(tabs.filter((tab) => tab.id !== undefined && tab.url).map(async (tab) => {
      const policy = findPolicy(tab.url, sites);
      if (!policy)
        return;
      if (policy.mode === "block")
        await browser.tabs.update(tab.id, { url: browser.runtime.getURL("blocked.html") });
      else {
        const state = await session.request(policy.key, "status", tab.id);
        if (state.expiresAt <= Date.now())
          await browser.tabs.update(tab.id, { url: gateFor(tab.url) });
      }
    }));
  });
  async function handleSession(message, sender) {
    const trustedGate = isPage(sender, gateURL);
    if (!["status", "begin", "open", "emergency", "close"].includes(message.action))
      throw new Error("Unknown action.");
    if (message.action !== "status" && !trustedGate)
      throw new Error("Open the access screen first.");
    const url = trustedGate ? message.url : sender.url;
    const policy = findPolicy(url, await readCustom());
    const tabId = sender.tab?.id ?? (trustedGate && Number.isInteger(message.tabId) ? message.tabId : undefined);
    if (trustedGate && Number.isInteger(tabId)) {
      const tab = await browser.tabs.get(tabId);
      if (tab.url?.split(/[?#]/)[0] !== gateURL)
        throw new Error("Open the access screen first.");
    }
    if (message.action === "close") {
      if (!Number.isInteger(tabId))
        throw new Error("Close this tab using Safari’s tab controls.");
      if (policy?.mode === "timed")
        await session.request(policy.key, "close", tabId, true);
      else
        await session.removeTab(tabId);
      await browser.tabs.remove(tabId);
      return { closed: true };
    }
    if (!policy || policy.mode !== "timed")
      return { policy };
    const state = await session.request(policy.key, message.action, tabId, trustedGate);
    if (state.expiresAt > Date.now())
      await browser.alarms.create(`site-expiry:${policy.key}`, { when: state.expiresAt });
    return { policy, state };
  }
  browser.runtime.onMessage.addListener((message, sender) => {
    if (message?.type === "site-session")
      return handleSession(message, sender).catch((error) => ({ error: error.message }));
    if (message?.type !== "custom-sites" || !isPage(sender, sitesURL))
      return;
    if (!["list", "add", "remove"].includes(message.action))
      return;
    return customSites.request(message.action, message.site).then(async (sites) => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      return { sites, currentHost: hostnameFromURL(tab?.url) };
    }).catch((error) => ({ error: error.message || "Could not save your sites." }));
  });
  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (!alarm.name.startsWith("site-expiry:"))
      return;
    const key = alarm.name.slice("site-expiry:".length);
    const state = await session.request(key, "status");
    if (state.expiresAt > Date.now())
      return;
    const sites = await readCustom();
    const tabs = await browser.tabs.query({});
    await Promise.allSettled(tabs.filter((tab) => tab.id !== undefined && findPolicy(tab.url, sites)?.key === key).map((tab) => browser.tabs.update(tab.id, { url: gateFor(tab.url) })));
  });
  browser.tabs.onRemoved.addListener((tabId) => session.removeTab(tabId));
  browser.tabs.onUpdated.addListener((tabId, change) => {
    if (!change.url)
      return;
    if (change.url.startsWith(gateURL + "#")) {
      let target;
      try {
        target = decodeURIComponent(change.url.slice(gateURL.length + 1));
      } catch {
        return;
      }
      readCustom().then(async (sites) => {
        const policy = findPolicy(target, sites);
        await session.removeTab(tabId, policy?.mode === "timed" ? policy.key : undefined);
        if (policy?.mode === "timed")
          return session.request(policy.key, "status", tabId, true);
      }).catch(() => {});
      return;
    }
    readCustom().then(async (sites) => {
      const policy = findPolicy(change.url, sites);
      await session.removeTab(tabId, policy?.mode === "timed" ? policy.key : undefined);
      if (policy?.mode !== "timed")
        return;
      const state = await session.request(policy.key, "status", tabId);
      if (state.expiresAt > Date.now())
        return;
      const tab = await browser.tabs.get(tabId);
      if ((tab.pendingUrl || tab.url) === change.url)
        await browser.tabs.update(tabId, { url: gateFor(change.url) });
    }).catch(() => {});
  });
  async function restore() {
    await customSites.request("restore");
    await browser.storage.local.remove("youtubeSession");
  }
  browser.runtime.onInstalled.addListener(restore);
  browser.runtime.onStartup.addListener(() => customSites.request("restore"));
})();
