import { RISK_LABELS, RISK_LEVELS } from "@/constants/risk";
import type { Checkpoint, ConditionFlag, PlannedRoute } from "@/types/api";
import { describeFlag, describeSky, formatTemperature, type SkyKind } from "@/utils/conditions";

export type BriefingTone = "good" | "info" | "warning" | "danger";

export interface BriefingItem {
  mile: number;
  eta: string;
  kind: "start" | "change" | "arrive";
  tone: BriefingTone;
  text: string;
  /** 1, 2, 3… for the changes between start and arrival: the same numbers as the map's pins. */
  number?: number;
}

// More than this between start and arrival reads as noise: the calmer ones go first.
const MAX_CHANGES = 7;
const TONE_RANK: Record<BriefingTone, number> = { good: 0, info: 1, warning: 2, danger: 3 };
const WET: ReadonlySet<SkyKind> = new Set(["fog", "drizzle", "rain", "snow", "storm"]);
// Rain that stops and starts again within this many miles is one spell, not four items.
const SPELL_GAP_MI = 60;

/** What changes along the drive, in order: risk, crosswind/ice/fog, rain or snow starting and
 *  stopping. Built from the checkpoints only, so it always matches the map and table. */
export function tripBriefing(route: PlannedRoute, from: string, to: string): BriefingItem[] {
  const stops = route.checkpoints;
  const first = stops[0];
  const last = stops[stops.length - 1];

  const changes: Change[] = [];
  for (let k = 1; k < stops.length; k++) {
    const parts = changesAt(stops[k - 1], stops[k]);
    if (!parts.length) continue;
    const tone = parts.reduce(
      (worst, p) => (TONE_RANK[p.tone] > TONE_RANK[worst] ? p.tone : worst),
      "good" as BriefingTone,
    );
    changes.push({
      mile: stops[k].mile,
      eta: stops[k].eta,
      kind: k === stops.length - 1 ? "arrive" : "change",
      tone,
      text: parts.map((p) => p.text).join(" · "),
      sky: parts.length === 1 ? parts[0].sky : undefined,
    });
  }

  // The arrival line always comes last, even when nothing changed there.
  const arrival = changes.at(-1)?.mile === last.mile ? changes.pop()! : null;
  const kept = keepMostImportant(mergeSpells(changes)).map((item, index) => ({
    ...item,
    number: index + 1,
  }));

  return [
    {
      mile: first.mile,
      eta: first.eta,
      kind: "start",
      tone: toneOf(first),
      text: `Leave ${from}: ${conditionsText(first)}`,
    },
    ...kept,
    {
      mile: last.mile,
      eta: last.eta,
      kind: "arrive",
      tone: arrival?.tone ?? toneOf(last),
      text: `Arrive ${to}: ${arrival ? arrival.text : conditionsText(last)}`,
    },
  ];
}

interface Sky {
  label: string;
  edge: "begins" | "ends";
}

interface Part {
  tone: BriefingTone;
  text: string;
  sky?: Sky;
}

/** A change that is only rain, fog or snow starting or stopping carries `sky`. */
type Change = BriefingItem & { sky?: Sky };

function changesAt(previous: Checkpoint, current: Checkpoint): Part[] {
  const parts: Part[] = [];
  const before = RISK_LEVELS.indexOf(previous.level);
  const now = RISK_LEVELS.indexOf(current.level);
  if (now > before) {
    parts.push({
      tone: now >= 2 ? "danger" : "warning",
      text: `${RISK_LABELS[current.level]} risk: ${current.reasons.join(", ")}`,
    });
  } else if (now < before) {
    parts.push(
      now === 0
        ? { tone: "good", text: "Back to Low risk" }
        : {
            tone: "warning",
            text: `Eases to ${RISK_LABELS[current.level]}: ${current.reasons.join(", ")}`,
          },
    );
  }

  const had = new Set<ConditionFlag>(previous.conditions.flags);
  for (const flag of current.conditions.flags) {
    if (!had.has(flag))
      parts.push({ tone: "warning", text: describeFlag(flag, current.conditions) });
  }
  const cleared = previous.conditions.flags.filter(
    (flag) => !current.conditions.flags.includes(flag),
  );
  if (cleared.length && !current.conditions.flags.length && now === 0 && before === 0) {
    parts.push({ tone: "good", text: "Conditions ease" });
  }

  const skyBefore = describeSky(previous.conditions.weather_code);
  const skyNow = describeSky(current.conditions.weather_code);
  if (skyBefore && skyNow && skyBefore.kind !== skyNow.kind) {
    if (WET.has(skyNow.kind)) {
      const sky: Sky = { label: skyNow.label, edge: "begins" };
      parts.push({ tone: "info", text: `${skyNow.label} begins`, sky });
    } else if (WET.has(skyBefore.kind)) {
      const sky: Sky = { label: skyBefore.label, edge: "ends" };
      parts.push({ tone: "good", text: `${skyBefore.label} ends`, sky });
    }
  }
  return parts;
}

/** "Drizzle begins", "Drizzle ends" a few miles apart → "Drizzle for 10 mi"; repeated short
 *  spells close together → "Drizzle on and off for 50 mi". */
function mergeSpells(changes: Change[]): BriefingItem[] {
  const merged: BriefingItem[] = [];
  for (let i = 0; i < changes.length; i++) {
    const start = changes[i];
    let end = i;
    while (
      start.sky?.edge === "begins" &&
      changes[end + 1]?.sky?.label === start.sky.label &&
      changes[end + 1].mile - changes[end].mile <= SPELL_GAP_MI
    )
      end++;
    // Only a spell that also ends here collapses; one still going stays "… begins".
    while (end > i && changes[end].sky?.edge !== "ends") end--;
    const item: BriefingItem = {
      mile: start.mile,
      eta: start.eta,
      kind: start.kind,
      tone: start.tone,
      text: start.text,
    };
    if (end === i) {
      merged.push(item);
      continue;
    }
    const miles = changes[end].mile - start.mile;
    const often = end - i > 1 ? " on and off" : "";
    merged.push({ ...item, tone: "info", text: `${start.sky!.label}${often} for ${miles} mi` });
    i = end;
  }
  return merged;
}

function keepMostImportant(changes: BriefingItem[]): BriefingItem[] {
  if (changes.length <= MAX_CHANGES) return changes;
  const ranked = [...changes].sort(
    (a, b) => TONE_RANK[b.tone] - TONE_RANK[a.tone] || a.mile - b.mile,
  );
  const keep = new Set(ranked.slice(0, MAX_CHANGES));
  return changes.filter((item) => keep.has(item));
}

function toneOf(checkpoint: Checkpoint): BriefingTone {
  const level = RISK_LEVELS.indexOf(checkpoint.level);
  if (level >= 2) return "danger";
  if (level === 1 || checkpoint.conditions.flags.length) return "warning";
  return "good";
}

/** "Overcast, 54 °F" plus any risk or warnings there. */
function conditionsText(checkpoint: Checkpoint): string {
  const { conditions } = checkpoint;
  const sky = describeSky(conditions.weather_code)?.label;
  const temperature =
    conditions.temperature_f === null ? null : formatTemperature(conditions.temperature_f);
  const parts = [[sky, temperature].filter(Boolean).join(", ") || "no forecast details"];
  if (checkpoint.level !== "low")
    parts.push(`${RISK_LABELS[checkpoint.level]} risk: ${checkpoint.reasons.join(", ")}`);
  parts.push(...conditions.flags.map((flag) => describeFlag(flag, conditions)));
  return parts.join(" · ");
}
