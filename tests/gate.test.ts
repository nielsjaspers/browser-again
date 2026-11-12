import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { createSessionController, BREATH_MS } from "../scripts/session.js";
const source = await Bun.file(new URL("../Extension/gate.js", import.meta.url)).text();
type State = { readyAt: number; expiresAt: number; cycle: number; tabs: number[]; gateTabs: number[] };
function room(initial: Record<string, State> = {}) {
  let now = 1_000_000;
  let stored = initial;
  let writes = 0;
  let policy: { key: string; mode: string; label: string } | null = { key: "youtube", mode: "timed", label: "YouTube" };
  const listeners: Array<(changes: object, area: string) => void> = [];
  const session = createSessionController({
    get: async () => structuredClone(stored),
    set: async (value: typeof stored) => {
      if (++writes > 50) throw new Error("Storage feedback loop");
      stored = structuredClone(value);
      queueMicrotask(() => listeners.forEach(listener => listener({ siteSessions: {} }, "local")));
    }
  }, () => now);
  async function createGate(id: number) {
    const events = new Map<string, () => void>();
    const elements = new Map<string, { textContent: string; hidden: boolean; disabled: boolean; addEventListener: (event: string, fn: () => void) => void }>();
    for (const name of ["site", "eyebrow", "heading", "detail", "close", "continue", "emergency", "error", "retry"]) {
      elements.set(name, { textContent: "", hidden: false, disabled: false, addEventListener: (_event, fn) => events.set(name, fn) });
    }
    let timer = () => {};
    const redirects: string[] = [];
    const body = { dataset: { phase: "loading" }, style: { setProperty: () => {} } };
    let requests = 0;
    await runInNewContext(`(async()=>{${source}\n})()`, {
      URL, Date: { now: () => now }, setTimeout: (fn: () => void) => { timer = fn; return 1; }, clearTimeout: () => {},
      location: { hash: "#https%3A%2F%2Fwww.youtube.com%2F", replace: (url: string) => redirects.push(url) },
      document: { querySelector: (selector: string) => elements.get(selector.slice(1)), body, title: "" },
      browser: {
        tabs: { getCurrent: async () => ({ id }) }, storage: { onChanged: { addListener: (fn: typeof listeners[number]) => listeners.push(fn) } },
        runtime: { getURL: (path: string) => path, sendMessage: async (message: { action: string }) => {
          requests++;
          return { policy, state: await session.request("youtube", message.action, id, true) };
        } }
      }
    });
    return { events, elements, redirects, body, tick: () => timer(), requests: () => requests };
  }
  const settle = async () => { for (let i = 0; i < 200; i++) await Promise.resolve(); };
  return { session, createGate, settle, advance: (ms: number) => { now += ms; }, writes: () => writes, removePolicy: () => { policy = null; listeners.forEach(listener => listener({ customSites: {} }, "local")); } };
}
test("an access screen recovers after another tab resets the session", async () => {
  const f = room({ youtube: { readyAt: 0, expiresAt: 0, cycle: 1, tabs: [1, 2], gateTabs: [1, 2] } });
  const gate = await f.createGate(1); await f.settle();
  expect(gate.elements.get("emergency")?.hidden).toBe(false);
  await f.session.removeTab(2); await f.settle();
  expect(gate.elements.get("emergency")?.hidden).toBe(true);
  expect(gate.body.dataset.phase).toBe("inhale");
  f.advance(BREATH_MS); gate.tick();
  expect(gate.body.dataset.phase).toBe("choice");
  gate.events.get("continue")?.(); await f.settle();
  expect(gate.redirects).toEqual(["https://www.youtube.com/"]);
  expect(gate.requests()).toBeLessThan(10);
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
