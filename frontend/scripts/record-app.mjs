#!/usr/bin/env node
// Real clips of the live app for the walkthrough video (VIDEO.md), 1280 × 800, 30 fps.
//   node scripts/record-app.mjs [clip names…]      (no names: every clip)
// Clips go to ../media/clips/<name>.mp4. APP=http://localhost:5173 records a local build.

import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { browserSession, sleep, until } from "./browser.mjs";
import { actor, record } from "./recorder.mjs";

const APP = process.env.APP ?? "https://truck-weather-routing-chi.vercel.app";
const root = fileURLToPath(new URL("../..", import.meta.url));
const out = `${root}media/clips`;
mkdirSync(out, { recursive: true });

const W = 1280;
const H = 800;
const TRIP =
  "from=32.7767%2C-96.797&fromName=Dallas%2C+Texas&to=32.5252%2C-93.7502&toName=Shreveport%2C+Louisiana" +
  "&load=35000&every=10";
const DEPART = process.env.DEPART ?? "2026-11-03T15:00:00.000Z";
// The same departure as a local time for the form's datetime field (Asia/Karachi, GMT+5).
const DEPART_LOCAL = process.env.DEPART_LOCAL ?? "2026-11-03T20:00";
// The form clip replaces this with the trip it planned, so every clip shows the same routes
// (place search's coordinates differ a little between Photon and its fallback).
let tripQuery = TRIP;
const trip = (extra = "", depart = DEPART) =>
  `${APP}/?${tripQuery}&depart=${encodeURIComponent(depart)}${extra}`;
const text = (s) => `document.body.innerText.includes(${JSON.stringify(s)})`;

/** Opens a plan and waits for the map (truck marker) and the heatmap; reloads if the map stalls. */
async function openPlan(page, url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto(url);
    try {
      await until(() => page.evaluate(text("Recommended: route")), "the plan", 90000);
      await waitForMap(page);
      return;
    } catch (error) {
      console.log(`  (attempt ${attempt}: ${error.message}, reloading)`);
    }
  }
  throw new Error(`plan never loaded: ${url}`);
}

async function waitForMap(page) {
  await until(
    () => page.evaluate(`!!document.querySelector(".maplibregl-marker")`),
    "the map",
    25000,
  );
  await until(
    () => page.evaluate(`${text("Moderate or worse")} || ${text("All Low along the corridor")}`),
    "the heatmap",
    60000,
  );
  await sleep(3500); // basemap tiles and the first heatmap frame
}

/** Screen position of route B's checkpoint at `mile`: open its popup from the table, read the tip. */
async function checkpointPoint(page, mile) {
  await page.evaluate(
    `document.querySelector('button[aria-label="Mile ${mile}: show on map"]').click()`,
  );
  await sleep(1200);
  await page.evaluate("window.scrollTo(0, 0)");
  await sleep(600);
  const point = await page.evaluate(`(() => {
    const tip = document.querySelector(".maplibregl-popup-tip").getBoundingClientRect();
    const popup = document.querySelector(".maplibregl-popup");
    const below = popup.className.includes("anchor-top");
    return { x: Math.round(tip.left + tip.width / 2), y: Math.round(below ? tip.top - 12 : tip.bottom + 12) };
  })()`);
  await page.evaluate(`document.querySelector(".maplibregl-popup-close-button").click()`);
  await sleep(600);
  return point;
}

const clips = {
  /** Requirement 1: empty-form errors, then the trip typed in, then Plan trip and the results. */
  async "01-form"(page, act) {
    await page.goto(`${APP}/`);
    await until(() => page.evaluate(text("How it works")), "the home page");
    await sleep(4000);
    const stop = await record(page, W, H);
    await sleep(800);
    await act.click(await act.locate("button", "Plan trip"), 1100);
    await sleep(1600);
    await act.click(await act.locate('input[placeholder="City or address"]'));
    await act.type("Dallas");
    await until(
      () => page.evaluate(`!!document.querySelector('[role="option"]')`),
      "Dallas suggestions",
    );
    await sleep(700);
    await act.click(await act.locate('[role="option"]', "Dallas, Texas"));
    await sleep(400);
    await act.click(
      await page.evaluate(
        `(() => { const r = document.querySelectorAll('input[placeholder="City or address"]')[1].getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
      ),
    );
    await act.type("Shrev");
    await until(
      () =>
        page.evaluate(
          `[...document.querySelectorAll('[role="option"]')].some((o) => o.textContent.includes("Shreveport, Louisiana"))`,
        ),
      "Shreveport",
    );
    await sleep(900);
    await act.click(await act.locate('[role="option"]', "Shreveport, Louisiana"));
    await sleep(400);
    // The date field: point at it, then set it (typing into a native date picker is fiddly).
    await act.click(await act.locate('input[type="datetime-local"]'));
    await page.evaluate(`(() => { const i = document.querySelector('input[type="datetime-local"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, ${JSON.stringify(DEPART_LOCAL)});
      i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); })()`);
    await act.key("Escape", "Escape", 27);
    await sleep(700);
    await act.click(await act.locate('input[placeholder="e.g. 35,000"]'));
    await act.type("35000", 130);
    await sleep(600);
    await act.click(await act.locate("button", "Plan trip"), 800);
    await until(() => page.evaluate(text("Recommended: route")), "the plan", 90000);
    await waitForMap(page);
    await sleep(1500);
    const search = new URLSearchParams(await page.evaluate("location.search"));
    for (const key of ["depart", "route", "hour"]) search.delete(key);
    tripQuery = search.toString();
    console.log(`  trip from the form: ${tripQuery}`);
    return stop;
  },

  /** Requirements 2 and 5: the three routes on the map, then the recommendation and the cards. */
  async "02-routes"(page, act) {
    await openPlan(page, trip());
    await page.evaluate("window.scrollTo(0, 0)");
    const stop = await record(page, W, H);
    await sleep(800);
    for (const label of ["A", "C"]) {
      const point = await page.evaluate(
        `(() => { const m = [...document.querySelectorAll(".maplibregl-marker")].find((e) => e.textContent.trim().startsWith(${JSON.stringify(label)})); if (!m) return null; const r = m.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
      );
      if (point) {
        await act.moveTo(point, 900);
        await sleep(900);
      }
    }
    await act.moveTo(await act.locate("div", "Take route B"), 1000);
    await sleep(2500);
    for (const name of ["Route B", "Route C", "Route A"]) {
      await act.moveTo(await act.locate("h3, button, span", name), 700);
      await sleep(1100);
    }
    return stop;
  },

  /** Requirement 6: a click on route A's checkpoint at mile 140 (Severe rain) opens its popup. */
  async "03-popup"(page, act) {
    await openPlan(page, trip("&route=A"));
    const point = await checkpointPoint(page, 140);
    const stop = await record(page, W, H);
    await sleep(600);
    await act.moveTo({ x: 900, y: 300 }, 600);
    await act.click(point, 1200);
    await sleep(5000);
    return stop;
  },

  /** Requirement 7: press play and watch 48 hours go by. */
  async "04-timeline"(page, act) {
    await openPlan(page, trip());
    await page.evaluate("window.scrollTo(0, 0)");
    const stop = await record(page, W, H);
    await sleep(600);
    await act.click(
      await act.locate('button[aria-label*="Play" i], button[aria-label*="play" i]'),
      1000,
    );
    await act.moveTo({ x: 1000, y: 520 }, 900);
    await sleep(7500);
    return stop;
  },

  /** Switching routes: everything follows the selected route. */
  async "05-switch"(page, act) {
    await openPlan(page, trip());
    await page.evaluate("window.scrollTo(0, 0)");
    const stop = await record(page, W, H);
    await sleep(500);
    await act.click(await act.locate("h3, span", "Route C"), 900);
    await sleep(2500);
    await act.scroll(160, 700);
    await act.click(await act.locate("h3, span", "Route A"), 800);
    await sleep(2500);
    return stop;
  },

  /** Requirement 3 and extras: the trip briefing, then the checkpoint table (route A). */
  async "06-briefing-table"(page, act) {
    await openPlan(page, trip("&route=A"));
    await page.evaluate("window.scrollTo(0, 0)");
    const stop = await record(page, W, H);
    await sleep(600);
    const briefing = await page.evaluate(
      `[...document.querySelectorAll("h2,h3")].find((h) => h.textContent.startsWith("Trip briefing")).getBoundingClientRect().top`,
    );
    await act.scroll(briefing - 20, 1600);
    await sleep(800);
    for (const label of ["High risk", "Severe risk", "Arrive"]) {
      await act.moveTo(await act.locate("button", label), 700);
      await sleep(1200);
    }
    const table = await page.evaluate(
      `[...document.querySelectorAll("h2,h3")].find((h) => h.textContent.startsWith("Checkpoints on route")).getBoundingClientRect().top`,
    );
    await act.scroll(table - 20, 1600);
    await sleep(600);
    const rows = await page.evaluate(`document.querySelector("tbody").getBoundingClientRect().top`);
    await act.scroll(rows + 11 * 38 - 300, 1800);
    for (const mile of [110, 140, 160]) {
      await act.moveTo(await act.locate(`button[aria-label="Mile ${mile}: show on map"]`), 600);
      await sleep(1100);
    }
    return stop;
  },

  /** Extra: "Safer to leave 2 h later", one click, plan again. */
  async "07-leave-later"(page, act) {
    await openPlan(page, trip());
    await page.evaluate("window.scrollTo(0, 0)");
    const stop = await record(page, W, H);
    await sleep(600);
    await act.moveTo(await act.locate("p, div", "Safer to leave"), 900);
    await sleep(1500);
    await act.click(await act.locate("button", "instead"), 800);
    await until(() => page.evaluate(`location.search.includes("%2B00%3A00")`), "the new departure");
    await until(() => page.evaluate(text("Recommended: route")), "the new plan", 90000);
    await waitForMap(page);
    await act.moveTo(await act.locate("div", "Take route"), 900);
    await sleep(2500);
    return stop;
  },

  /** Extra: the rules panel. */
  async "08-risk-rules"(page, act) {
    await page.goto(`${APP}/`);
    await until(() => page.evaluate(text("How risk is scored")), "the home page");
    await sleep(3000);
    const stop = await record(page, W, H);
    await sleep(500);
    await act.click(await act.locate("summary", "How risk is scored"), 900);
    await sleep(800);
    const top = await page.evaluate(
      `document.querySelector("details").getBoundingClientRect().top`,
    );
    await act.scroll(top - 20, 1500);
    await sleep(3500);
    await act.scroll(420, 2200);
    await sleep(3000);
    return stop;
  },

  /** Extra: a departure beyond the forecast, and the one-click fix. */
  async "09-error"(page) {
    const stop = await record(page, W, H);
    await page.goto(trip("", "2026-11-30T15:00:00.000Z"));
    await until(() => page.evaluate(text("15 days")), "the forecast error", 60000);
    await sleep(1200);
    const act = actor(page);
    await act.moveTo(await act.locate("button", "instead"), 1000);
    await sleep(2500);
    return stop;
  },
};

const wanted = process.argv.slice(2);
const chrome = await browserSession();
try {
  for (const [name, run] of Object.entries(clips)) {
    if (wanted.length && !wanted.includes(name)) continue;
    const page = await chrome.openPage(W, H);
    await page.send("Emulation.setTimezoneOverride", { timezoneId: "Asia/Karachi" });
    await page.send("Page.enable");
    const stop = await run(page, actor(page));
    const info = await stop(`${out}/${name}.mp4`);
    console.log(
      `  ${name}.mp4  ${info.seconds.toFixed(1)} s, ${info.frames} frames (${info.fps.toFixed(0)} fps captured)`,
    );
    await page.send("Page.close").catch(() => {});
  }
} finally {
  await chrome.close();
}
console.log(`saved to ${out}`);
