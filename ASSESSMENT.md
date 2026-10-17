# Full Stack Developer — Weather-Aware Truck Routing

Build a React + Django web app that helps a truck driver choose the safest route based on weather,
load weight, and travel time.

## Requirements

The user enters:
- Origin & destination
- Departure date/time
- Load weight

The app should:
- Generate 3 route options using a routing API.
- Sample weather every 10 / 25 / 50 miles, using the truck's estimated arrival time at each checkpoint.
- Calculate weather risk using the provided risk/load rules.
- Recommend the best route, balancing weather risk and travel time.
- Show all routes, checkpoints, risk levels, ETAs, and route summaries on a map.
- Show a weather heatmap along the trip corridor with a 0–48 hour forecast slider.

You may use third-party APIs for routing, geocoding, and weather. You do not need to build a routing engine.

## Risk Rules

| Condition | Low | Moderate | High | Severe | No Travel |
|---|---|---|---|---|---|
| Wind | <25 mph | 25–34 | 35–44 | 45–54 | ≥55 mph |
| Rain | <0.10 in/hr | 0.10–0.25 | 0.25–0.50 | 0.50–1.00 | >1.00 |
| Snow | <0.5 in/hr | 0.5–1.0 | 1.0–2.0 | 2.0–3.0 | >3.0 |

Load rules:
- ≥55 mph → No Travel for any load
- 45–54 mph + >30,000 lb → No Travel
- 35–44 mph + >40,000 lb → Severe

## Route Recommendation

Prefer:
1. Fewest Severe miles
2. Fewest High miles
3. Lowest average risk
4. Shortest travel times

## Deliverables
- GitHub repository
- Hosted application
- 5–10 min Loom walkthrough

## Evaluation
- 40% Routes, weather, risk & recommendation logic
- 40% UI, map & heatmap smoothness and performance
- 15% Code quality
- 5% Documentation & walkthrough

Prioritize correctness and clarity over extra features.

## Agreed interpretations (Phase 0)
1. Sampling interval (10/25/50 mi) is a user setting, default 10.
2. Bands are lower-bound inclusive; strict ">" only where the table says (rain >1.00, snow >3.0).
3. No Travel miles rank first, ahead of Severe miles.
4. Each checkpoint covers half the distance to each neighbour, so covered miles sum to route length.
5. Average risk = mile-weighted score, Low=0 … No Travel=4.
6. Wind = sustained 10 m wind speed (not gusts).
7. Heatmap slider hours are relative to departure.
8. Truck travel time = routing-engine time with a ~65 mph speed cap; no rest breaks.
9. Weather at a checkpoint = forecast hour nearest its ETA.
10. Departure limited to the forecast horizon.
