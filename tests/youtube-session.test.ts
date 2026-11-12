import { expect, test } from "bun:test";
import { createSessionController, PASS_MS, WAIT_MS } from "../Extension/session.js";

function fixture() {
  let time = 1_000_000;
  let saved: { readyAt: number; expiresAt: number } | undefined;
  const storage = { get: async () => saved, set: async (state: NonNullable<typeof saved>) => { saved = state; } };
  return {
    session: createSessionController(storage, () => time),
    restart: () => createSessionController(storage, () => time),
    advance: (ms: number) => { time += ms; },
    now: () => time
  };
}

test("confirmation waits ten seconds and then grants five full minutes", async () => {
  const f = fixture();
  expect((await f.session.request("status")).expiresAt).toBe(0);
  const pending = await f.session.request("begin");
  expect(pending.readyAt).toBe(f.now() + WAIT_MS);
  f.advance(WAIT_MS - 1);
  expect((await f.session.request("open")).expiresAt).toBe(0);
  f.advance(1);
  const pass = await f.session.request("open");
  expect(pass.expiresAt).toBe(f.now() + PASS_MS);
  f.advance(PASS_MS - 1);
  expect((await f.session.request("status")).expiresAt).toBe(pass.expiresAt);
  f.advance(1);
  expect(await f.session.request("status")).toEqual({ readyAt: 0, expiresAt: 0 });
  expect((await f.session.request("open")).expiresAt).toBe(0);
  expect((await f.session.request("begin")).readyAt).toBe(f.now() + WAIT_MS);
});

test("multiple tabs and Emergency cannot extend an active pass", async () => {
  const f = fixture();
  const [one, two] = await Promise.all([f.session.request("emergency"), f.session.request("emergency")]);
  expect(one.expiresAt).toBe(two.expiresAt);
  f.advance(45_000);
  for (const action of ["status", "begin", "open", "emergency"]) {
    expect((await f.session.request(action)).expiresAt).toBe(one.expiresAt);
  }
});

test("Emergency skips a pending wait but still expires", async () => {
  const f = fixture();
  await f.session.request("begin");
  f.advance(1000);
  const pass = await f.session.request("emergency");
  expect(pass).toEqual({ readyAt: 0, expiresAt: f.now() + PASS_MS });
  f.advance(PASS_MS);
  expect((await f.session.request("status")).expiresAt).toBe(0);
});

test("a background restart or another tab retains the original wait and expiration", async () => {
  const f = fixture();
  const pending = await f.session.request("begin");
  f.advance(5000);
  expect(await f.restart().request("begin")).toEqual(pending);
  f.advance(5000);
  const pass = await f.restart().request("open");
  f.advance(60_000);
  expect(await f.restart().request("status")).toEqual(pass);
  f.advance(PASS_MS);
  expect(await f.restart().request("status")).toEqual({ readyAt: 0, expiresAt: 0 });
});
