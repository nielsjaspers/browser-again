import { expect, test } from "bun:test";
import { createSessionController, PASS_MS, BREATH_MS } from "../scripts/session.js";

type State = { readyAt: number; expiresAt: number; cycle: number; tabs: number[] };
function fixture() {
  let time = 1_000_000;
  let saved: Record<string, State> = {};
  let writes = 0;
  const storage = { get: async () => structuredClone(saved), set: async (state: typeof saved) => { saved = structuredClone(state); writes++; } };
  return { session: createSessionController(storage, () => time), restart: () => createSessionController(storage, () => time), advance: (ms: number) => { time += ms; }, now: () => time, writes: () => writes };
}
test("first visit requires a full breath and an explicit continue", async () => {
  const f = fixture();
  await expect(f.session.request("youtube", "emergency", 1)).rejects.toThrow("first breathing cycle");
  const pending = await f.session.request("youtube", "begin", 1);
  expect(pending.readyAt).toBe(f.now() + BREATH_MS);
  f.advance(BREATH_MS - 1);
  expect((await f.session.request("youtube", "open", 1)).expiresAt).toBe(0);
  f.advance(1);
  expect((await f.session.request("youtube", "status", 1)).expiresAt).toBe(0);
  const pass = await f.session.request("youtube", "open", 1);
  expect(pass.expiresAt).toBe(f.now() + PASS_MS);
  expect(pass.cycle).toBe(1);
});
test("Emergency renews an expired cycle, cannot extend an active pass, and stays site-specific", async () => {
  const f = fixture();
  await f.session.request("youtube", "begin", 1); f.advance(BREATH_MS);
  const first = await f.session.request("youtube", "open", 1);
  f.advance(20_000);
  expect((await f.session.request("youtube", "emergency", 2)).expiresAt).toBe(first.expiresAt);
  f.advance(PASS_MS);
  const renewed = await f.session.request("youtube", "emergency", 1);
  expect(renewed.expiresAt).toBe(f.now() + PASS_MS);
  expect(renewed.cycle).toBe(2);
  await expect(f.session.request("linkedin.com", "emergency", 3)).rejects.toThrow();
});
test("closing the access screen resets all eligibility for that site", async () => {
  const f = fixture();
  await f.session.request("youtube", "begin", 1); f.advance(BREATH_MS);
  await f.session.request("youtube", "open", 1);
  await f.session.request("youtube", "close", 1);
  await expect(f.session.request("youtube", "emergency", 1)).rejects.toThrow();
  expect((await f.session.request("youtube", "begin", 1)).readyAt).toBe(f.now() + BREATH_MS);
});
test("closing all associated tabs ends the session; closing one preserves the shared pass", async () => {
  const f = fixture();
  await f.session.request("youtube", "begin", 1); f.advance(BREATH_MS);
  const pass = await f.session.request("youtube", "open", 1);
  await f.session.request("youtube", "status", 2);
  await f.session.removeTab(1);
  expect((await f.session.request("youtube", "status", 2)).expiresAt).toBe(pass.expiresAt);
  await f.session.removeTab(2);
  expect((await f.session.request("youtube", "status", 3)).cycle).toBe(0);
});
test("concurrent tabs and background restarts keep the original deadline", async () => {
  const f = fixture();
  await f.session.request("youtube", "begin", 1); f.advance(BREATH_MS);
  const [a,b] = await Promise.all([f.session.request("youtube", "open", 1), f.session.request("youtube", "open", 2)]);
  expect(a.expiresAt).toBe(b.expiresAt);
  f.advance(60_000);
  expect((await f.restart().request("youtube", "status", 2)).expiresAt).toBe(a.expiresAt);
  f.advance(PASS_MS);
  expect((await f.restart().request("youtube", "status", 2)).expiresAt).toBe(0);
});
test("status reads do not trigger a storage event loop", async () => {
  const f = fixture();
  await f.session.request("youtube", "status", 1);
  const writes = f.writes();
  await f.session.request("youtube", "status", 1);
  expect(f.writes()).toBe(writes);
});

test("closing an expired access-screen tab resets the site even when another tab remains", async () => {
  const f = fixture();
  await f.session.request("youtube", "begin", 1, true); f.advance(BREATH_MS);
  await f.session.request("youtube", "open", 1, true);
  await f.session.request("youtube", "status", 2);
  f.advance(PASS_MS);
  await f.session.request("youtube", "begin", 1, true);
  await f.session.request("youtube", "begin", 2, true);
  await f.session.removeTab(1);
  expect((await f.session.request("youtube", "status", 2, true)).cycle).toBe(0);
  await expect(f.session.request("youtube", "emergency", 2, true)).rejects.toThrow();
});
