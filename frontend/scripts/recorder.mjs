// Records real clips of the app for the demo video: a DevTools screencast of a headless page,
// with a drawn mouse cursor that glides, clicks (with a ripple) and types like a person.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sleep } from "./browser.mjs";

const CURSOR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><path d="M3 2l14 8.5-6.2 1.3L7.6 18z" fill="white" stroke="black" stroke-width="1.3" stroke-linejoin="round"/></svg>';

/** Drawn cursor and ripple, injected into the page (headless Chrome draws no pointer). */
const INSTALL_CURSOR = `(() => {
  if (window.__cursor) return;
  const c = document.createElement("div");
  c.innerHTML = ${JSON.stringify(CURSOR_SVG)};
  c.style.cssText = "position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))";
  document.documentElement.appendChild(c);
  const state = { x: -100, y: -100 };
  const ease = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
  window.__cursor = {
    place(x, y) { state.x = x; state.y = y; c.style.transform = "translate(" + (x - 3) + "px," + (y - 2) + "px)"; },
    move(x, y, ms) {
      const fx = state.x < 0 ? x - 200 : state.x, fy = state.y < 0 ? y + 120 : state.y;
      const t0 = performance.now();
      return new Promise((done) => {
        const step = (now) => {
          const t = Math.min(1, (now - t0) / ms), e = ease(t);
          this.place(fx + (x - fx) * e, fy + (y - fy) * e);
          if (t < 1) requestAnimationFrame(step); else done();
        };
        requestAnimationFrame(step);
      });
    },
    ripple(x, y) {
      const r = document.createElement("div");
      r.style.cssText = "position:fixed;left:" + (x - 18) + "px;top:" + (y - 18) + "px;width:36px;height:36px;border-radius:50%;border:3px solid #2dd4bf;z-index:2147483646;pointer-events:none;transition:transform .45s ease-out,opacity .45s ease-out;transform:scale(.3);opacity:1";
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => requestAnimationFrame(() => { r.style.transform = "scale(1.4)"; r.style.opacity = "0"; }));
      setTimeout(() => r.remove(), 600);
    },
  };
})()`;

/** Helpers that act on `page` like a person would. */
export function actor(page) {
  let at = { x: -100, y: -100 };
  const mouse = (type, x, y, extra = {}) =>
    page.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, ...extra });

  const self = {
    installCursor: () => page.evaluate(INSTALL_CURSOR),
    /** Centre of the first element matching `selector` (optionally containing `text`), in viewport px. */
    async locate(selector, text) {
      const point = await page.evaluate(`(() => {
        const all = [...document.querySelectorAll(${JSON.stringify(selector)})];
        const el = ${text ? `all.find((e) => e.textContent.includes(${JSON.stringify(text)}))` : "all[0]"};
        if (!el) return null;
        el.scrollIntoView({ block: "nearest" });
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      })()`);
      if (!point) throw new Error(`not found: ${selector} ${text ?? ""}`);
      return point;
    },
    async moveTo({ x, y }, ms = 700) {
      await self.installCursor();
      await page.evaluate(`window.__cursor.move(${x}, ${y}, ${ms})`);
      await mouse("mouseMoved", x, y, { button: "none" });
      at = { x, y };
    },
    async click(point, ms) {
      if (point) await self.moveTo(point, ms);
      await sleep(150);
      await page.evaluate(`window.__cursor.ripple(${at.x}, ${at.y})`);
      await mouse("mousePressed", at.x, at.y);
      await mouse("mouseReleased", at.x, at.y);
      await sleep(250);
    },
    /** Types into the focused field, one key at a time. */
    async type(text, perKeyMs = 110) {
      for (const ch of text) {
        await page.send("Input.insertText", { text: ch });
        await sleep(perKeyMs + Math.round(Math.sin(ch.charCodeAt(0)) * 35));
      }
    },
    async key(key, code = key, keyCode = 0) {
      for (const type of ["rawKeyDown", "keyUp"]) {
        await page.send("Input.dispatchKeyEvent", {
          type,
          key,
          code,
          windowsVirtualKeyCode: keyCode,
        });
      }
    },
    /** Smooth page scroll by `dy` px. */
    scroll: (dy, ms = 900) =>
      page.evaluate(`new Promise((done) => { const y0 = scrollY, t0 = performance.now();
        const step = (now) => { const t = Math.min(1, (now - t0) / ${ms}); const e = t < .5 ? 2*t*t : 1 - (-2*t + 2) ** 2 / 2;
          scrollTo(0, y0 + ${dy} * e); if (t < 1) requestAnimationFrame(step); else done(); };
        requestAnimationFrame(step); })`),
  };
  return self;
}

/** Starts a screencast; `stop(file)` encodes it to a 30 fps MP4 and returns its length in seconds. */
export async function record(page, width, height) {
  const frames = [];
  const off = page.on("Page.screencastFrame", (params) => {
    frames.push({ data: params.data, t: params.metadata.timestamp });
    page.send("Page.screencastFrameAck", { sessionId: params.sessionId }).catch(() => {});
  });
  await page.send("Page.startScreencast", {
    format: "jpeg",
    quality: 92,
    maxWidth: width,
    maxHeight: height,
    everyNthFrame: 1,
  });
  const started = Date.now() / 1000;

  return async function stop(file) {
    const ended = Date.now() / 1000;
    await page.send("Page.stopScreencast");
    off();
    if (frames.length === 0) throw new Error("no frames recorded");
    const dir = mkdtempSync(join(tmpdir(), "truck-clip-"));
    try {
      const lines = [];
      frames.forEach((frame, i) => {
        const name = join(dir, `${String(i).padStart(5, "0")}.jpg`);
        writeFileSync(name, Buffer.from(frame.data, "base64"));
        const next = i + 1 < frames.length ? frames[i + 1].t : Math.max(ended, frame.t + 0.04);
        const from = i === 0 ? Math.min(frame.t, started) : frame.t;
        lines.push(`file '${name}'`, `duration ${Math.max(0.001, next - from).toFixed(4)}`);
      });
      lines.push(`file '${join(dir, `${String(frames.length - 1).padStart(5, "0")}.jpg`)}'`);
      writeFileSync(join(dir, "list.txt"), lines.join("\n"));
      const result = spawnSync(
        "ffmpeg",
        [
          "-v",
          "error",
          "-y",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          join(dir, "list.txt"),
          "-vf",
          `fps=30,scale=${width}:${height}:flags=lanczos,format=yuv420p`,
          "-c:v",
          "libx264",
          "-crf",
          "16",
          "-preset",
          "medium",
          "-movflags",
          "+faststart",
          file,
        ],
        { encoding: "utf8" },
      );
      if (result.status !== 0) throw new Error(`ffmpeg: ${result.stderr}`);
      const seconds = ended - Math.min(frames[0].t, started);
      return { seconds, frames: frames.length, fps: frames.length / seconds };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}
