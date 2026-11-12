export const WAIT_MS = 10_000;
export const PASS_MS = 5 * 60_000;

// Serialize requests so two tabs cannot start or extend separate passes.
export function createSessionController(storage, now = Date.now) {
  let queue = Promise.resolve();
  function request(action) {
    const result = queue.then(async () => {
      const saved = await storage.get();
      let state = saved && Number.isFinite(saved.readyAt) && Number.isFinite(saved.expiresAt)
        ? saved : { readyAt: 0, expiresAt: 0 };
      const time = now();
      if (state.expiresAt && state.expiresAt <= time) state = { readyAt: 0, expiresAt: 0 };
      if (state.expiresAt > time) return state;
      if (action === "begin" && !state.readyAt) state = { readyAt: time + WAIT_MS, expiresAt: 0 };
      if (action === "emergency" || (action === "open" && state.readyAt && time >= state.readyAt)) {
        state = { readyAt: 0, expiresAt: time + PASS_MS };
      }
      if (state.readyAt !== saved?.readyAt || state.expiresAt !== saved?.expiresAt) await storage.set(state);
      return state;
    });
    queue = result.catch(() => {});
    return result;
  }
  return { request };
}
