// Headless Chrome over the DevTools protocol, for the demo video's screenshots. No Puppeteer.

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEBUG_PORT = 9334;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function until(check, what, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check().catch(() => null);
    if (value) return value;
    await sleep(200);
  }
  throw new Error(`timed out waiting for ${what}`);
}

export async function browserSession() {
  const profile = mkdtempSync(join(tmpdir(), "truck-demo-"));
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      // The map is WebGL; headless Chrome draws it in software.
      "--enable-unsafe-swiftshader",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const version = await until(
    () => fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`).then((r) => r.json()),
    "Chrome to start",
  );
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.method) for (const listener of listeners) listener(msg);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  };
  const call = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params, ...(sessionId ? { sessionId } : {}) }));
    });

  return {
    /** A page with a fixed viewport, so the layout is the one in the screenshots. */
    async openPage(width, height) {
      const { targetId } = await call("Target.createTarget", {
        url: "about:blank",
        newWindow: true,
      });
      const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
      await call(
        "Emulation.setDeviceMetricsOverride",
        { width, height, deviceScaleFactor: 1, mobile: false },
        sessionId,
      );
      const evaluate = async (expression) => {
        const { result, exceptionDetails } = await call(
          "Runtime.evaluate",
          { expression, returnByValue: true, awaitPromise: true },
          sessionId,
        );
        if (exceptionDetails)
          throw new Error(exceptionDetails.exception?.description ?? "evaluate failed");
        return result.value;
      };
      return {
        evaluate,
        goto: (url) => call("Page.navigate", { url }, sessionId),
        async screenshot(path) {
          const { data } = await call("Page.captureScreenshot", { format: "png" }, sessionId);
          writeFileSync(path, Buffer.from(data, "base64"));
        },
        /** A real mouse event (for the map canvas and checkboxes). */
        async click(x, y) {
          for (const type of ["mousePressed", "mouseReleased"]) {
            await call(
              "Input.dispatchMouseEvent",
              { type, x, y, button: "left", clickCount: 1 },
              sessionId,
            );
          }
        },
        async type(text) {
          await call("Input.insertText", { text }, sessionId);
        },
        /** Any DevTools command on this page. */
        send: (method, params) => call(method, params, sessionId),
        /** Calls `handler(params)` for this page's `method` events; returns an unsubscribe. */
        on(method, handler) {
          const listener = (msg) =>
            msg.sessionId === sessionId && msg.method === method && handler(msg.params);
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
    },
    async close() {
      ws.close();
      const exited = new Promise((r) => chrome.once("exit", r));
      chrome.kill();
      await Promise.race([exited, sleep(3000)]);
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}
