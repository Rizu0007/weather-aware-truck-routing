# Walkthrough Video Script: Weather-Aware Truck Routing (~7 min)

**Live site:** https://truck-weather-routing-chi.vercel.app

The brief asks for a 5–10 minute walkthrough and says *"prioritize correctness and clarity over
extra features."* So the video goes in this order:

| Part | Time | What | Why |
|---|---|---|---|
| 1. Intro | 0:00–0:35 | The problem in plain words | Sets up everything else |
| 2. **Core** | 0:35–5:05 | The 7 requirements, **in the brief's order**, each shown working | 80% of the grade (logic 40%, map 40%) |
| 3. Extras | 5:05–6:15 | Things we added beyond the brief, clearly labelled | Shows care, but doesn't hide the core |
| 4. Close | 6:15–7:00 | How the data flows, tech stack | Code quality + documentation |

Narration is written to be spoken: short sentences, everyday words, about 2.6 words per second.
"Real" means a screenshot of the live app; "Drawn" means a simple animation drawn in code.

---

## Demo trip

**Dallas, Texas → Shreveport, Louisiana · leaves Tue Nov 3, 8:00 PM GMT+5 (15:00 UTC) · 35,000 lb · every 10 mi**

https://truck-weather-routing-chi.vercel.app/?from=32.77627%2C-96.79686&fromName=Dallas%2C+Texas&to=32.51354%2C-93.74778&toName=Shreveport%2C+Louisiana&depart=2026-11-03T15%3A00%3A00.000Z&load=35000&every=10

(The exact trip the form plans when you pick Dallas, Texas and Shreveport, Louisiana.)

| Route | Time | Miles | Risk miles | Grade |
|---|---|---|---|---|
| **B (recommended)**, via Winnsboro | 4 h 16 min | 216 | Low 186 · Moderate 20 · High 10 · **Severe 0** | C · 79 |
| C, via Whitehouse | 4 h 00 min | 212 | Low 182 · High 20 · **Severe 10** | D · 69 |
| A (fastest) | 3 h 20 min | 187 | Low 147 · Moderate 10 · High 20 · **Severe 10** (rain 0.53 in/hr at mile 140) | D · 69 |

**Leave 2 h later** (10 PM): route C becomes all Low, Grade A · 100, and is recommended.

> ⚠️ This link stops working after about **9 PM GMT+5 on Nov 3**, and the forecast changes every
> hour. Capture the screenshots **today**. If the numbers change, update the lines marked 🔢.

---

## Part 1 · Intro (0:00–0:35)

### Scene 1 · Title (0:00–0:12)
**Screen (Drawn):** App name. A truck on a road, a dark rain cloud ahead.

> "Hi. This is Weather-Aware Truck Routing. It helps a truck driver pick the safest route, not just the fastest one."

### Scene 2 · The problem (0:12–0:35)
**Screen (Drawn):** A storm cloud 200 miles up the road. A clock goes from 0 h to 3 h, and the cloud moves.

> "Here's the problem. A storm two hundred miles ahead only matters if it's still there when the truck arrives. And a heavy truck in strong wind is a lot more dangerous than a car. So the real question is: what will the weather be on each part of the road, at the time the truck gets there?"

---

## Part 2 · Core requirements (0:35–5:05)

A small label in the corner shows which requirement is on screen: **"Requirement 1 of 7"**, and so on.

### Requirement 1 · The driver's input (0:35–1:05)
**Screen (Real):** Home page, zoom on the form. Click Plan trip with an empty form: the red errors appear. Type "Shrev": suggestions appear.

> "First, the driver enters the trip. Where they start, where they're going, when they leave, and the load in pounds."
>
> "If something's missing, the form tells you right away. And place search suggests real towns as you type. Here's Shreveport, Louisiana."

### Requirement 2 · Three routes (1:05–1:40)
**Screen (Real):** Results for the demo trip. The three route lines on the map, A, B and C, highlighted one by one.

> "When I click Plan trip, the app asks a routing service, OSRM, for routes. Here we get three: A, B and C."
>
> "One honest note. The free OSRM server often gives only one or two routes. So the app finds extra ones by routing through a nearby town on either side. The towns come from a list built into the app, so this works even when a free map service is down. If there really is only one sensible road, it shows fewer routes and says so."

### Requirement 3 · Weather at the truck's arrival time (1:40–2:20)
**Screen (Drawn → Real):** A route line with dots every 10 miles, each dot getting a clock time. Then cut to the real checkpoint table: Mile / ETA columns highlighted.

> "Next, the weather. The app puts a checkpoint every ten miles. You can also pick twenty-five or fifty."
>
> "For each checkpoint, it works out when the truck will get there. Then it reads the forecast for that hour, not for right now."
>
> "So at mile zero it's eight PM, at mile one hundred it's nine forty-five, and so on. Every checkpoint has its own time and its own weather." 🔢

### Requirement 4 · Risk rules and load rules (2:20–3:05)
**Screen (Drawn):** The brief's table appears row by row: Wind, Rain, Snow. Then the three load rules with a heavy truck icon. Then a quick cut to `backend/trips/domain/risk.py`.

> "Then every checkpoint gets a risk level, using the exact rules from the brief."
>
> "Wind, rain and snow each get a level, from Low up to No Travel. The checkpoint takes the worst of the three."
>
> "Then the load rules. Wind of fifty-five or more is No Travel for any truck. Forty-five to fifty-four, with more than thirty thousand pounds, is also No Travel. And thirty-five to forty-four, with more than forty thousand pounds, becomes Severe."
>
> "All of this lives in one small file, risk dot py, and it's fully tested."

### Requirement 5 · The recommendation (3:05–3:50)
**Screen (Real):** Zoom on the green "Take route B" box. Then the three route cards. Drawn: the routes sort themselves step by step: Severe miles → High miles → average risk → time.

> "Now the recommendation. The app ranks routes in the brief's order. Fewest Severe miles first. Then fewest High miles. Then the lowest average risk. And last, the shortest time."
>
> "Look at this trip. Route A is the fastest, by almost an hour. But it drives into heavy rain, with ten miles at Severe. Route B takes longer, but has no Severe miles at all. So the app recommends route B, and it tells you why, right here: zero Severe miles, against ten on the next route." 🔢
>
> "I added one rule the brief doesn't list: No Travel miles count before Severe miles. Because No Travel is even worse."

### Requirement 6 · The map (3:50–4:25)
**Screen (Real):** Route A selected on the map. The cursor clicks its checkpoint at mile 140. The popup opens.

> "Everything is on the map. Each route is coloured by risk: green is Low, yellow Moderate, orange High, red Severe."
>
> "Click any checkpoint, and you see what the truck will meet there. This is route A, at mile one forty. The truck arrives at ten twenty-six PM, into rain of zero point five three inches an hour. That's Severe." 🔢
>
> "The route cards on the left give the summary: time, miles, arrival, and how many miles at each risk level."

### Requirement 7 · Heatmap with a 0–48 hour slider (4:25–5:05)
**Screen (Real):** Cursor presses play. The rain band moves east, and the truck icon drives along route B until it arrives (+5 h).

> "Last, the weather heatmap. The coloured area is the risk around the whole trip, not just on the road."
>
> "This slider goes from now to forty-eight hours ahead. When I press play, you can watch the rain move east, and the truck drive towards Shreveport."
>
> "It's smooth because all forty-eight hours load once, at the start. Moving the slider just redraws a tiny image. It never waits for the server."

---

## Part 3 · Extras, beyond the brief (5:05–6:15)

**Screen:** A title card: **"Extras: not in the brief"**. Then quick cuts, about 10 seconds each.

> "That's all seven requirements. I also added a few extras. Quickly:"

| Time | Screen (Real) | Narration |
|---|---|---|
| 5:10 | "Safer to leave 2 h later" box, click, the routes turn green | "One. Best time to leave. The app checks the next twenty-four departure times. Here, leaving two hours later misses the storm: route C is all Low. One click, and it plans again." 🔢 |
| 5:22 | Grade badges on the route cards | "Two. A safety grade, A to F, so you can compare routes at a glance." |
| 5:30 | Trip briefing list (route A) | "Three. A trip briefing, like a driver's summary. On route A, rain starts near mile one hundred, and it's Severe at mile one forty." 🔢 |
| 5:42 | Checkpoint table, the "Why" column | "Four. A table with every checkpoint, and why it got its risk level." |
| 5:50 | Popup: gusts, crosswind, visibility | "Five. Extra driving info, like gusts, crosswind and visibility. It's shown to the driver, but it doesn't change the score." |
| 5:58 | The URL bar | "Six. The whole trip is in the link, so a dispatcher can send it to a driver." |
| 6:05 | Error message: "Forecasts only reach about 15 days ahead" | "And seven. Clear error messages, like when the date is too far ahead, or there's no road." |

---

## Part 4 · How it works, and close (6:15–7:00)

### Scene · Data flow (6:15–6:45)
**Screen (Drawn):** Boxes appear one by one, with a dot travelling along the arrows:
`Browser (React)` → `Django API` → `OSRM` / `Open-Meteo` → `checkpoints → risk → ranking` → back to the browser.

> "Here's how it fits together. The React app sends the trip to a Django API. Django gets routes from OSRM and the hourly forecast from Open-Meteo. Then it builds checkpoints, scores the risk and ranks the routes. The browser just draws the result."
>
> "The logic is kept in small, plain Python files, and there are over five hundred tests."

### Scene · Close (6:45–7:00)
**Screen (Drawn):** Tech chips: React, Django, OSRM, Open-Meteo, Vercel. Title and the live URL.

> "So, in one click, a driver gets a clear answer: which route is safest, and why. Thanks for watching."

---

## Real clips (recorded from the live site)

`cd frontend && node scripts/record-app.mjs` drives the live site in headless Chrome, with a drawn
cursor, click ripples and letter-by-letter typing, and saves 30 fps clips to `media/clips/`. The
form clip runs first, and every other clip reuses the exact trip it planned, so all clips show
the same routes.

| Clip | Used in | Shows |
|---|---|---|
| `01-form` | Requirement 1 | Empty-form errors, typing Dallas and Shreveport, load, Plan trip, results |
| `02-routes` | Requirements 2 and 5 | Routes A, B, C on the map; the "Take route B" box; the three cards |
| `03-popup` | Requirement 6 | Click route A, mile 140: Severe, rain 0.53 in/hr |
| `04-timeline` | Requirement 7 | Press play: the rain moves east, the truck drives to Shreveport |
| `05-switch` | Requirement 6 | Click route C, then route A: the map follows |
| `06-briefing-table` | Requirement 3, extras | Route A's briefing, then the checkpoint table (ETA, risk, why) |
| `07-leave-later` | Extras | "Safer to leave 2 h later", click, route C all Low |
| `08-risk-rules` | Requirement 4 | "How risk is scored" opened and scrolled |
| `09-error` | Extras | Departure beyond the forecast, with the one-click fix |

Stills from `node scripts/capture-app.mjs` (in `media/shots/`) fill any quiet moments.

## Build

Follow `video-demo.md`, with the real clips above in place of most screenshots. The Kokoro voice (`af_heart`) and its venv are already installed at
`/Users/mrmacbook/light-show-anywhere/.demo-tools`, and ffmpeg is installed, so nothing needs to be downloaded.

## Tested on Nov 2, 2026

Backend 270 passed · frontend 245 passed · live site and API OK · form errors, place search,
3 routes, risk bands, ranking order, popup, timeline, route switching, "leave later", and the
beyond-forecast / no-road / bad-input errors all checked.

**Fixed the same day:** Photon refused the hosted backend for hours, so new trips got only 1 route.
Via-towns now come from a bundled GeoNames list; after the deploy, Dallas → Shreveport, Austin →
Houston and Dallas → Little Rock all get 3 routes on the live site.
