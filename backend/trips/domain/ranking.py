"""Risk summaries and the recommendation order: No Travel, Severe, High miles, avg risk, time."""

from collections.abc import Callable
from dataclasses import dataclass

from trips.domain.risk import RiskLevel

# Differences below these are noise from interpolation, not real differences
# between routes, so they fall through to the next criterion.
MILES_PRECISION = 1  # decimals: 0.1 mi
AVG_RISK_PRECISION = 2  # decimals: 0.01 on the 0-4 scale


@dataclass(frozen=True)
class RiskSummary:
    miles_by_level: dict[RiskLevel, float]
    avg_risk: float  # mile-weighted, 0 (all Low) to 4 (all No Travel)
    max_level: RiskLevel


def summarize(stretches: list[tuple[float, RiskLevel]]) -> RiskSummary:
    """From (miles, level) pairs, one per checkpoint."""
    miles_by_level = dict.fromkeys(RiskLevel, 0.0)
    for miles, level in stretches:
        miles_by_level[level] += miles
    total = sum(miles_by_level.values())
    weighted = sum(int(level) * miles for level, miles in miles_by_level.items())
    return RiskSummary(
        miles_by_level=miles_by_level,
        avg_risk=weighted / total if total else 0.0,
        max_level=max((level for miles, level in stretches if miles > 0), default=RiskLevel.LOW),
    )


@dataclass(frozen=True)
class Candidate:
    route_id: str
    summary: RiskSummary
    duration_s: float


@dataclass(frozen=True)
class Ranking:
    order: list[str]  # route ids, recommended first
    reason: str


@dataclass(frozen=True)
class _Criterion:
    name: str
    value: Callable[[Candidate], float]  # what is compared; lower is better
    show: Callable[[Candidate], str]  # how it reads in the explanation


def _miles_at(level: RiskLevel) -> _Criterion:
    def value(c: Candidate) -> float:
        return round(c.summary.miles_by_level[level], MILES_PRECISION)

    return _Criterion(f"Fewest {level.label} miles", value, lambda c: f"{value(c):.1f} mi")


def _avg_risk(c: Candidate) -> float:
    return round(c.summary.avg_risk, AVG_RISK_PRECISION)


def _hours(seconds: float) -> str:
    minutes = round(seconds / 60)
    return f"{minutes // 60} h {minutes % 60:02d} min"


CRITERIA = (
    _miles_at(RiskLevel.NO_TRAVEL),
    _miles_at(RiskLevel.SEVERE),
    _miles_at(RiskLevel.HIGH),
    _Criterion("Lowest average risk", _avg_risk, lambda c: f"{_avg_risk(c):.2f}"),
    _Criterion(
        "Shortest travel time", lambda c: round(c.duration_s), lambda c: _hours(c.duration_s)
    ),
)


def sort_key(candidate: Candidate) -> tuple:
    return tuple(criterion.value(candidate) for criterion in CRITERIA)


def rank(candidates: list[Candidate]) -> Ranking:
    """Best route first, with the reason it beats the runner-up."""
    if not candidates:
        raise ValueError("nothing to rank")
    ordered = sorted(candidates, key=sort_key)  # stable: equal routes keep their order
    order = [c.route_id for c in ordered]
    if len(ordered) == 1:
        return Ranking(order, "Only route found.")

    best, runner_up = ordered[0], ordered[1]
    for criterion in CRITERIA:
        if criterion.value(best) != criterion.value(runner_up):
            reason = (
                f"{criterion.name}: {criterion.show(best)} "
                f"vs {criterion.show(runner_up)} on route {runner_up.route_id}."
            )
            return Ranking(order, reason)
    return Ranking(order, f"Tied with route {runner_up.route_id} on every criterion.")
