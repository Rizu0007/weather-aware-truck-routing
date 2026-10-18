// Order matters: index = the backend's 0-4 risk score.
export const RISK_LEVELS = ["low", "moderate", "high", "severe", "no_travel"] as const;

export type RiskLevel = (typeof RISK_LEVELS)[number];

export const RISK_LABELS: Record<RiskLevel, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  severe: "Severe",
  no_travel: "No Travel",
};

// Literal class names, so Tailwind can find them in the source.
export const RISK_BG: Record<RiskLevel, string> = {
  low: "bg-risk-low",
  moderate: "bg-risk-moderate",
  high: "bg-risk-high",
  severe: "bg-risk-severe",
  no_travel: "bg-risk-no-travel",
};
