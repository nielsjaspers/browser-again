import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
const source = await Bun.file(new URL("../Extension/background.js", import.meta.url)).text();

test("background grants only from the prompt and expiry redirects only YouTube tabs", async () => {
  let time = 100000;
  let state: { readyAt: number; expiresAt: number } | undefined;
  type Message = { type: string; action: string };
  let message: (message: Message, sender: { url: string }) => Promise<NonNullable<typeof state>> | undefined = () => undefined;
  let alarm: (alarm: { name: string }) => Promise<void> = async () => {};
  const redirected: { id: number; url: string }[] = [];
  const scheduled: number[] = [];
  const gateURL = "safari-web-extension://test/youtube.html";
  runInNewContext(source, {
    Date: { now: () => time }, URL,
    browser: {
      runtime: { getURL: () => gateURL, onMessage: { addListener: (handler: typeof message) => { message = handler; } } },
      storage: { local: {
        get: async () => ({ youtubeSession: state }),
        set: async (data: { youtubeSession: NonNullable<typeof state> }) => { state = data.youtubeSession; }
      } },
      alarms: {
        create: async (_name: string, options: { when: number }) => { scheduled.push(options.when); },
        onAlarm: { addListener: (handler: typeof alarm) => { alarm = handler; } }
      },
      tabs: {
        query: async () => [{ id: 1, url: "https://m.youtube.com/watch?v=123" }, { id: 2, url: "https://example.org/" }, { id: 3, url: "https://youtube.com.example.org/" }],
        update: async (id: number, options: { url: string }) => { redirected.push({ id, ...options }); }
      }
    }
  });
  expect(message({ type: "youtube-session", action: "emergency" }, { url: "https://www.youtube.com/" })).toBeUndefined();
  expect(state).toBeUndefined();
  const pass = await message({ type: "youtube-session", action: "emergency" }, { url: gateURL + "#video" });
  expect(pass?.expiresAt).toBe(time + 300000);
  expect(scheduled).toEqual([time + 300000]);
  await alarm({ name: "youtube-expiry" });
  expect(redirected).toEqual([]);
  time += 300000;
  await alarm({ name: "youtube-expiry" });
  expect(redirected).toEqual([{ id: 1, url: gateURL + "#https%3A%2F%2Fm.youtube.com%2Fwatch%3Fv%3D123" }]);
  expect(state?.expiresAt).toBe(0);
});
