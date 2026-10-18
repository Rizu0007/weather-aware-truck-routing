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
