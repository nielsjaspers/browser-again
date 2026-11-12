import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { createSessionController, BREATH_MS, PASS_MS, EMERGENCY_MS, COOLDOWN_MS } from "../scripts/session.js";
const source = await Bun.file(new URL("../Extension/gate.js", import.meta.url)).text();
type State = { readyAt: number; expiresAt: number; cycle: number; tabs: number[]; gateTabs: number[] };
function room(initial: Record<string, State> = {}) {
  let now = 1_000_000;
  let stored = { siteSessions: initial, siteOpenings: {} as Record<string, number[]>, siteCooldowns: {} as Record<string, number> };
  let writes = 0;
  let policy: { key: string; mode: string; label: string } | null = { key: "youtube", mode: "timed", label: "YouTube" };
  const listeners: Array<(changes: object, area: string) => void> = [];
  const session = createSessionController({
    get: async () => structuredClone(stored),
    set: async (value: Partial<typeof stored>) => {
      if (++writes > 50) throw new Error("Storage feedback loop");
      stored = { ...stored, ...structuredClone(value) };
      queueMicrotask(() => listeners.forEach(listener => listener(Object.fromEntries(Object.keys(value).map(key => [key, {}])), "local")));
    }
  }, () => now);
  async function createGate(id: number) {
    const events = new Map<string, () => void>();
    const elements = new Map<string, { textContent: string; hidden: boolean; disabled: boolean; addEventListener: (event: string, fn: () => void) => void }>();
    for (const name of ["heading", "detail", "usage", "cooldown", "close", "continue", "emergency", "error", "retry"]) {
      elements.set(name, { textContent: "", hidden: false, disabled: false, addEventListener: (_event, fn) => events.set(name, fn) });
    }
    const animations: { currentTime: number; cancelled: boolean; cancel: () => void }[] = [];
    const orb = { animate: () => {
      const animation = { currentTime: 0, cancelled: false, cancel() { this.cancelled = true; } };
      animations.push(animation);
      return animation;
    } };
    let timer = () => {};
    const redirects: string[] = [];
    const body = { dataset: { phase: "loading" }, style: { setProperty: () => {} } };
    let requests = 0;
    await runInNewContext(`(async()=>{${source}\n})()`, {
      URL, Date: { now: () => now }, setTimeout: (fn: () => void) => { timer = fn; return 1; }, clearTimeout: () => {},
      location: { hash: "#https%3A%2F%2Fwww.youtube.com%2F", replace: (url: string) => redirects.push(url) },
      document: { querySelector: (selector: string) => selector === "#orb" ? orb : elements.get(selector.slice(1)), body, title: "" },
      browser: {
        tabs: { getCurrent: async () => ({ id }) }, storage: { onChanged: { addListener: (fn: typeof listeners[number]) => listeners.push(fn) } },
        runtime: { getURL: (path: string) => path, sendMessage: async (message: { action: string }) => {
          requests++;
          return { policy, state: await session.request("youtube", message.action, id, true) };
        } }
      }
    });
    return { events, elements, redirects, body, animations, tick: () => timer(), requests: () => requests };
  }
  const settle = async () => { for (let i = 0; i < 200; i++) await Promise.resolve(); };
  return { session, createGate, settle, advance: (ms: number) => { now += ms; }, writes: () => writes, removePolicy: () => { policy = null; listeners.forEach(listener => listener({ customSites: {} }, "local")); } };
}
test("the breath prompt waits seven seconds before offering an explicit choice", async () => {
  const f = room();
  const gate = await f.createGate(1); await f.settle();
  expect(gate.elements.get("heading")?.textContent).toBe("Take a slow breath.");
  expect(gate.elements.get("continue")?.hidden).toBe(true);
  expect(gate.elements.get("emergency")?.hidden).toBe(true);
  expect(gate.animations).toHaveLength(1);
  f.advance(6_999); gate.tick();
  expect(gate.animations).toHaveLength(1);
  expect(gate.elements.get("heading")?.textContent).toBe("Take a slow breath.");
  expect(gate.elements.get("continue")?.hidden).toBe(true);
  f.advance(1); gate.tick();
  expect(gate.elements.get("heading")?.textContent).toBe("Open YouTube?");
  expect(gate.elements.get("continue")?.hidden).toBe(false);
  expect(gate.redirects).toEqual([]);
  expect(gate.animations[0].cancelled).toBe(true);
});
test("an access screen recovers after another tab resets the session", async () => {
  const f = room({ youtube: { readyAt: 0, expiresAt: 0, cycle: 1, tabs: [1, 2], gateTabs: [1, 2] } });
  const gate = await f.createGate(1); await f.settle();
  expect(gate.elements.get("emergency")?.hidden).toBe(false);
  await f.session.removeTab(2); await f.settle();
  expect(gate.elements.get("emergency")?.hidden).toBe(true);
  expect(gate.body.dataset.phase).toBe("breathing");
  f.advance(BREATH_MS); gate.tick();
  expect(gate.body.dataset.phase).toBe("choice");
  gate.events.get("continue")?.(); await f.settle();
  expect(gate.redirects).toEqual(["https://www.youtube.com/"]);
  expect(gate.requests()).toBeLessThan(10);
});
test("an expired normal cycle offers different normal and Emergency durations", async () => {
  const f = room({ youtube: { readyAt: 0, expiresAt: 0, cycle: 2, tabs: [1], gateTabs: [1] } });
  const gate = await f.createGate(1); await f.settle();
  expect(gate.elements.get("emergency")?.hidden).toBe(false);
  expect(gate.elements.get("continue")?.hidden).toBe(true);
  f.advance(BREATH_MS); gate.tick();
  expect(gate.elements.get("continue")?.hidden).toBe(false);
  expect(gate.elements.get("emergency")?.hidden).toBe(false);
});
test("two live access screens settle without repeated writes or automatic navigation", async () => {
  const f = room();
  const a = await f.createGate(1);
  const b = await f.createGate(2); await f.settle();
  expect(f.writes()).toBeLessThan(10);
  expect(a.redirects).toEqual([]); expect(b.redirects).toEqual([]);
  f.advance(BREATH_MS); a.tick(); b.tick();
  b.events.get("continue")?.(); await f.settle();
  expect(b.redirects).toEqual(["https://www.youtube.com/"]);
  expect(a.redirects).toEqual([]);
  expect(a.elements.get("emergency")?.hidden).toBe(true);
  expect(a.body.dataset.phase).toBe("choice");
  const before = f.writes();
  a.events.get("continue")?.(); await f.settle();
  expect(a.redirects).toEqual(["https://www.youtube.com/"]);
  expect(f.writes() - before).toBeLessThan(5);
});

test("removing a rule leaves its waiting access screen on an explicit choice", async () => {
  const f = room();
  const gate = await f.createGate(1); await f.settle();
  f.removePolicy(); await f.settle();
  expect(gate.redirects).toEqual([]);
  expect(gate.body.dataset.phase).toBe("choice");
  expect(gate.elements.get("heading")?.textContent).toBe("This site is unblocked.");
  expect(gate.elements.get("emergency")?.hidden).toBe(true);
  gate.events.get("continue")?.(); await f.settle();
  expect(gate.redirects).toEqual(["https://www.youtube.com/"]);
});

test("a new tab joins the existing breath without restarting its visual cycle", async () => {
  const f = room();
  const a = await f.createGate(1); await f.settle();
  f.advance(4_000);
  const b = await f.createGate(2); await f.settle();
  expect(a.animations).toHaveLength(1);
  expect(b.animations).toHaveLength(1);
  expect(b.animations[0].currentTime).toBe(4_000);
});
test("an Emergency renewal is counted once and its next choice has one access action", async () => {
  const f = room();
  await f.session.request("youtube", "begin", 1, true);
  f.advance(BREATH_MS);
  await f.session.request("youtube", "open", 1, true);
  f.advance(PASS_MS);
  const renewal = await f.createGate(1); await f.settle();
  expect(renewal.elements.get("usage")?.textContent).toBe("Opened 1 time in the last 24 hours.");
  renewal.events.get("emergency")?.(); await f.settle();
  expect(renewal.redirects).toEqual(["https://www.youtube.com/"]);
  f.advance(EMERGENCY_MS);
  const next = await f.createGate(1); await f.settle();
  expect(next.elements.get("usage")?.textContent).toBe("Opened 2 times in the last 24 hours.");
  expect(next.elements.get("emergency")?.hidden).toBe(true);
  expect(next.elements.get("cooldown")?.textContent).toBe("Emergency available in 60 minutes.");
  f.advance(BREATH_MS); next.tick();
  expect(next.elements.get("emergency")?.hidden).toBe(true);
  expect(next.elements.get("continue")?.hidden).toBe(false);
  expect(next.redirects).toEqual([]);
  next.events.get("continue")?.(); await f.settle();
  expect((await f.session.request("youtube", "status", 1)).opens24h).toBe(3);
});

test("a waiting choice refreshes when the Emergency cooldown ends without opening automatically", async () => {
  const f = room();
  await f.session.request("youtube", "begin", 1, true); f.advance(BREATH_MS);
  await f.session.request("youtube", "open", 1, true); f.advance(PASS_MS);
  await f.session.request("youtube", "emergency", 1, true); f.advance(EMERGENCY_MS);
  const gate = await f.createGate(1); await f.settle();
  f.advance(BREATH_MS); gate.tick();
  expect(gate.elements.get("emergency")?.hidden).toBe(true);
  f.advance(COOLDOWN_MS - BREATH_MS - 60_000); gate.tick(); await f.settle();
  expect(gate.elements.get("cooldown")?.textContent).toBe("Emergency available in 1 minute.");
  f.advance(60_000); gate.tick(); await f.settle();
  expect(gate.elements.get("emergency")?.hidden).toBe(false);
  expect(gate.elements.get("cooldown")?.hidden).toBe(true);
  expect(gate.redirects).toEqual([]);
});
test("joining an active Emergency pass describes existing access without adding time or an opening", async () => {
  const f = room();
  await f.session.request("youtube", "begin", 1, true); f.advance(BREATH_MS);
  await f.session.request("youtube", "open", 1, true); f.advance(PASS_MS);
  const pass = await f.session.request("youtube", "emergency", 1, true);
  const gate = await f.createGate(2); await f.settle();
  expect(gate.elements.get("continue")?.textContent).toBe("Continue to site");
  expect(gate.elements.get("emergency")?.hidden).toBe(true);
  gate.events.get("continue")?.(); await f.settle();
  expect(gate.redirects).toEqual(["https://www.youtube.com/"]);
  const joined = await f.session.request("youtube", "status", 2);
  expect(joined.expiresAt).toBe(pass.expiresAt);
  expect(joined.opens24h).toBe(2);
});
