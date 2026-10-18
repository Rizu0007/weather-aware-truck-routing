"""A 0-100 safety score and A-F grade per route.

The worst level on the route sets the band, as it leads the recommendation; the share of
miles at that level sets the score within it.
"""

from dataclasses import dataclass

from trips.domain.ranking import MILES_PRECISION, RiskSummary
from trips.domain.risk import RiskLevel

# Worst level -> (letter, top and bottom score of its band).
BANDS = {
    RiskLevel.NO_TRAVEL: ("F", 59, 0),
    RiskLevel.SEVERE: ("D", 69, 60),
    RiskLevel.HIGH: ("C", 79, 70),
}
# Low and Moderate only: 100 when all Low, 80 when all Moderate; A down to 90.
CALM_TOP, CALM_BOTTOM, A_FROM = 100, 80, 90


@dataclass(frozen=True)
class SafetyGrade:
    score: int
    letter: str


def grade(summary: RiskSummary) -> SafetyGrade:
    miles = {level: round(m, MILES_PRECISION) for level, m in summary.miles_by_level.items()}
    total = sum(summary.miles_by_level.values()) or 1.0
    for level, (letter, top, bottom) in BANDS.items():
        if miles[level] > 0:
            return SafetyGrade(_score(top, bottom, miles[level] / total), letter)
    score = _score(CALM_TOP, CALM_BOTTOM, miles[RiskLevel.MODERATE] / total)
    return SafetyGrade(score, "A" if score >= A_FROM else "B")


def _score(top: int, bottom: int, share: float) -> int:
    return round(top - (top - bottom) * min(share, 1.0))
