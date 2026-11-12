export const BREATH_MS = 10_000;
export const PASS_MS = 5 * 60_000;
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
      const saved = await storage.get() || {};
      let state = saved[key] || fresh();
      state = { ...state, gateTabs: state.gateTabs || [] };
      const time = now();
      if (Number.isInteger(tabId) && !state.tabs.includes(tabId)) state = { ...state, tabs: [...state.tabs, tabId] };
      if (action === "close") {
        const next = { ...saved };
        delete next[key];
        await storage.set(next);
        return fresh();
      }
      if (state.expiresAt <= time) {
        state = { ...state, expiresAt: 0 };
        if (action === "begin" && !state.readyAt) state.readyAt = time + BREATH_MS;
        if (action === "emergency" && state.cycle === 0) throw new Error("Complete your first breathing cycle before using Emergency.");
        if (action === "emergency" || (action === "open" && state.readyAt > 0 && time >= state.readyAt)) {
          state = { ...state, readyAt: 0, expiresAt: time + PASS_MS, cycle: state.cycle + 1 };
        }
      }
      if (Number.isInteger(tabId)) {
        const staysAtGate = atGate && !(state.expiresAt > time && ["open", "emergency"].includes(action));
        const gateTabs = staysAtGate
          ? state.gateTabs.includes(tabId) ? state.gateTabs : [...state.gateTabs, tabId]
          : state.gateTabs.filter(id => id !== tabId);
        state = { ...state, gateTabs };
      }
      if (JSON.stringify(saved[key]) !== JSON.stringify(state)) await storage.set({ ...saved, [key]: state });
      return state;
    });
  }
  function removeTab(tabId, exceptKey) {
    return enqueue(async () => {
      const saved = await storage.get() || {};
      const next = {};
      for (const [key, state] of Object.entries(saved)) {
        if (key !== exceptKey && state.gateTabs?.includes(tabId)) continue;
        const tabs = key === exceptKey ? state.tabs : state.tabs.filter(id => id !== tabId);
        if (tabs.length) next[key] = { ...state, tabs, gateTabs: (state.gateTabs || []).filter(id => tabs.includes(id)) };
      }
      await storage.set(next);
    });
  }
  return { request, removeTab };
}
