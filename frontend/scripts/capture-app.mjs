#!/usr/bin/env node
// Screenshots of the live app for the walkthrough video (VIDEO.md), 1280 × 800.
//   node scripts/capture-app.mjs [output folder]
// APP=http://localhost:5173 to shoot a local build instead of the live site.

import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { browserSession, sleep, until } from "./browser.mjs";

const APP = process.env.APP ?? "https://truck-weather-routing-chi.vercel.app";
const root = fileURLToPath(new URL("../..", import.meta.url));
const out = resolve(process.argv[2] ?? `${root}media/shots`);
mkdirSync(out, { recursive: true });

const W = 1280;
const H = 800;
const TRIP =
  "from=32.7767%2C-96.797&fromName=Dallas%2C+Texas&to=32.5252%2C-93.7502&toName=Shreveport%2C+Louisiana" +
  "&load=35000&every=10";
const DEPART = process.env.DEPART ?? "2026-11-03T15:00:00.000Z";
const trip = (extra = "", depart = DEPART) =>
  `${APP}/?${TRIP}&depart=${encodeURIComponent(depart)}${extra}`;

const text = (s) => `document.body.innerText.includes(${JSON.stringify(s)})`;
const clickButton = (starts) =>
  `[...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(${JSON.stringify(starts)})).click()`;
const scrollToHeading = (starts) =>
  `(() => { const h = [...document.querySelectorAll("h2,h3")].find((e) => e.textContent.trim().startsWith(${JSON.stringify(starts)})); h.scrollIntoView({ block: "start" }); window.scrollBy(0, -16); })()`;

async function shot(page, name) {
  await sleep(500);
  await page.screenshot(join(out, `${name}.png`));
  console.log(`  ${name}.png`);
}

/** Opens a plan and waits for the map (truck marker = map loaded) and the heatmap. */
async function openPlan(page, url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto(url);
    try {
      await until(() => page.evaluate(text("Recommended: route")), "the plan", 90000);
      await until(
        () => page.evaluate(`!!document.querySelector(".maplibregl-marker")`),
        "the map",
        25000,
      );
      await until(
        () =>
          page.evaluate(`${text("Moderate or worse")} || ${text("All Low along the corridor")}`),
        "the heatmap",
        60000,
      );
      await sleep(3500); // basemap tiles and the first heatmap frame
      return;
    } catch (error) {
      // The map can stall on its first load (seen once on Nov 2); a reload fixes it.
      console.log(`  (attempt ${attempt}: ${error.message}, reloading)`);
    }
  }
  throw new Error(`plan never loaded: ${url}`);
}

const chrome = await browserSession();
try {
  const page = await chrome.openPage(W, H);

  // 1–3: home, form errors, place search.
  await page.goto(`${APP}/`);
  await until(() => page.evaluate(text("How it works")), "the home page");
  await sleep(4000); // basemap preview
  await shot(page, "01-home");

  await page.evaluate(clickButton("Plan trip"));
  await until(() => page.evaluate(text("Enter the load weight")), "the form errors");
  await shot(page, "02-form-errors");

  await page.evaluate(
    `document.querySelectorAll('input[placeholder="City or address"]')[1].focus()`,
  );
  await page.type("Shrev");
  await until(
    () =>
      page.evaluate(
        `${text("Shreveport, Louisiana")} && !!document.querySelector('[role="option"]')`,
      ),
    "suggestions",
  );
  await shot(page, "03-place-search");

  // 10: the risk rules panel (opened on the home page, where it has room).
  await page.goto(`${APP}/`);
  await until(() => page.evaluate(text("How risk is scored")), "the home page");
  await page.evaluate(`document.querySelector("details").open = true`);
  await sleep(3000);
  await page.evaluate(`document.querySelector("details").scrollIntoView({ block: "start" })`);
  await shot(page, "10-risk-rules");

  // 4–5: results and the popup at route B, mile 200.
  await openPlan(page, trip());
  await page.evaluate("window.scrollTo(0, 0)");
  await shot(page, "04-results");

  await page.evaluate(
    `document.querySelector('button[aria-label="Mile 200: show on map"]').click()`,
  );
  await sleep(1500);
  await page.evaluate("window.scrollTo(0, 0)");
  await sleep(1500);
  await shot(page, "05-popup");

  // 6: the timeline, hour by hour.
  for (const hour of [0, 2, 4, 5]) {
    await openPlan(page, trip(hour ? `&hour=${hour}` : ""));
    await page.evaluate("window.scrollTo(0, 0)");
    await shot(page, `06-timeline-${hour}h`);
  }

  // 7: route C, briefing and table.
  await openPlan(page, trip("&route=C"));
  await page.evaluate("window.scrollTo(0, 0)");
  await shot(page, "07-route-c");
  await page.evaluate(scrollToHeading("Trip briefing"));
  await shot(page, "07-briefing");
  await page.evaluate(scrollToHeading("Checkpoints on route"));
  await shot(page, "07-table");

  // 8: leave later.
  await openPlan(page, trip());
  await page.evaluate("window.scrollTo(0, 0)");
  await shot(page, "08-leave-later-before");
  const later = await page.evaluate(
    `document.body.innerText.match(/Leave [^\\n]+ instead/)?.[0] ?? null`,
  );
  if (later) {
    await page.evaluate(clickButton("Leave "));
    await until(() => page.evaluate(`location.search.includes("%2B00%3A00")`), "the new departure");
    await openPlan(page, await page.evaluate("location.href"));
    await page.evaluate("window.scrollTo(0, 0)");
    await shot(page, "08-leave-later-after");
  } else {
    console.log("  (no leave-later advice for this departure: skipped 08-leave-later-after)");
  }

  // 9: beyond the forecast.
  await page.goto(trip("", "2026-11-30T15:00:00.000Z"));
  await until(() => page.evaluate(text("15 days")), "the forecast error", 60000);
  await sleep(1000);
  await shot(page, "09-beyond-forecast");
} finally {
  await chrome.close();
}
console.log(`saved to ${out}`);
