export const BREATH_MS = 7_000;
export const PASS_MS = 5 * 60_000;
export const EMERGENCY_MS = 15 * 60_000;
export const COOLDOWN_MS = 60 * 60_000;
export const DAY_MS = 24 * 60 * 60_000;
const fresh = () => ({ readyAt: 0, expiresAt: 0, cycle: 0, tabs: [], gateTabs: [] });

// One queue protects shared storage when different sites or tabs request access.
export function createSessionController(storage, now = Date.now) {
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
      const openings = Object.fromEntries(Object.entries(history)
        .map(([site, times]) => [site, times.filter(at => at > time - DAY_MS && at <= time)])
        .filter(([, times]) => times.length));
      const cooldowns = Object.fromEntries(Object.entries(savedCooldowns).filter(([, readyAt]) => readyAt > time));
      const result = state => ({ ...state, opens24h: (openings[key] || []).length, emergencyReadyAt: cooldowns[key] || 0 });
      let state = saved[key] || fresh();
      state = { ...state, gateTabs: state.gateTabs || [] };
      if (Number.isInteger(tabId) && !state.tabs.includes(tabId)) state = { ...state, tabs: [...state.tabs, tabId] };
      if (action === "close") {
        const next = { ...saved };
        delete next[key];
        await storage.set({ siteSessions: next, siteOpenings: openings, siteCooldowns: cooldowns });
        return result(fresh());
      }
      if (state.expiresAt <= time) {
        state = { ...state, expiresAt: 0 };
        if (action === "begin" && !state.readyAt) state.readyAt = time + BREATH_MS;
        if (action === "emergency" && state.cycle === 0) throw new Error("Complete your first breathing cycle before using Emergency.");
        if (action === "emergency" && cooldowns[key]) throw new Error("Emergency is unavailable during its one-hour cooldown.");
        if (action === "emergency" || (action === "open" && state.readyAt > 0 && time >= state.readyAt)) {
          state = { ...state, readyAt: 0, expiresAt: time + (action === "emergency" ? EMERGENCY_MS : PASS_MS), cycle: state.cycle + 1 };
          if (action === "emergency") cooldowns[key] = state.expiresAt + COOLDOWN_MS;
          openings[key] = [...(openings[key] || []), time];
        }
      }
      if (Number.isInteger(tabId)) {
        const staysAtGate = atGate && !(state.expiresAt > time && ["open", "emergency"].includes(action));
        const gateTabs = staysAtGate
          ? state.gateTabs.includes(tabId) ? state.gateTabs : [...state.gateTabs, tabId]
          : state.gateTabs.filter(id => id !== tabId);
        state = { ...state, gateTabs };
      }
      const changes = {};
      if (JSON.stringify(saved[key]) !== JSON.stringify(state)) changes.siteSessions = { ...saved, [key]: state };
      if (JSON.stringify(history) !== JSON.stringify(openings)) changes.siteOpenings = openings;
      if (JSON.stringify(savedCooldowns) !== JSON.stringify(cooldowns)) changes.siteCooldowns = cooldowns;
      if (Object.keys(changes).length) await storage.set(changes);
      return result(state);
    });
  }
  function removeTab(tabId, exceptKey) {
    return enqueue(async () => {
      const { siteSessions: saved = {} } = await storage.get();
      const next = {};
      for (const [key, state] of Object.entries(saved)) {
        if (key !== exceptKey && state.gateTabs?.includes(tabId)) continue;
        const tabs = key === exceptKey ? state.tabs : state.tabs.filter(id => id !== tabId);
        if (tabs.length) next[key] = { ...state, tabs, gateTabs: (state.gateTabs || []).filter(id => tabs.includes(id)) };
      }
      await storage.set({ siteSessions: next });
    });
  }
  return { request, removeTab };
}
