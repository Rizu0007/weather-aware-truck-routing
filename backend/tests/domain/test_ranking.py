import pytest

from trips.domain.ranking import Candidate, rank, summarize
from trips.domain.risk import RiskLevel as L

HOUR = 3600


def route(route_id, hours=4.0, **miles):
    """A candidate with the given miles per level (keyword = level name in lower case)."""
    stretches = [(m, L[name.upper()]) for name, m in miles.items()]
    return Candidate(route_id, summarize(stretches or [(100, L.LOW)]), hours * HOUR)


def test_summarize_totals_miles_and_mile_weighted_average():
    summary = summarize([(60, L.LOW), (30, L.HIGH), (10, L.NO_TRAVEL), (5, L.HIGH)])

    assert summary.miles_by_level == {
        L.LOW: 60,
        L.MODERATE: 0,
        L.HIGH: 35,
        L.SEVERE: 0,
        L.NO_TRAVEL: 10,
    }
    assert summary.avg_risk == pytest.approx((35 * 2 + 10 * 4) / 105)
    assert summary.max_level == L.NO_TRAVEL


def test_summarize_ignores_zero_length_stretches_for_max_level():
    assert summarize([(10, L.LOW), (0, L.SEVERE)]).max_level == L.LOW


@pytest.mark.parametrize(
    ("a", "b", "reason"),
    [
        # Each case: A wins on this criterion although B is better on every later one.
        (
            route("A", hours=9, low=90, severe=10),
            route("B", hours=4, low=95, no_travel=5),
            "Fewest No Travel miles: 0.0 mi vs 5.0 mi on route B.",
        ),
        (
            route("A", hours=9, low=50, high=50),
            route("B", hours=4, low=99, severe=1),
            "Fewest Severe miles: 0.0 mi vs 1.0 mi on route B.",
        ),
        (
            route("A", hours=9, low=50, moderate=50),
            route("B", hours=4, low=99, high=1),
            "Fewest High miles: 0.0 mi vs 1.0 mi on route B.",
        ),
        (
            route("A", hours=9, low=80, moderate=20),
            route("B", hours=4, low=50, moderate=50),
            "Lowest average risk: 0.20 vs 0.50 on route B.",
        ),
        (
            route("A", hours=4.2),
            route("B", hours=5.1),
            "Shortest travel time: 4 h 12 min vs 5 h 06 min on route B.",
        ),
    ],
)
def test_criteria_apply_in_order(a, b, reason):
    for candidates in ([a, b], [b, a]):
        ranking = rank(candidates)

        assert ranking.order == ["A", "B"]
        assert ranking.reason == reason


def test_severe_miles_beat_any_number_of_high_miles():
    ranking = rank([route("A", low=99, severe=1), route("B", low=0, high=100)])

    assert ranking.order == ["B", "A"]


def test_ranks_all_three_routes():
    ranking = rank(
        [
            route("A", hours=4, low=90, high=10),
            route("B", hours=6, low=100),
            route("C", hours=5, low=100),
        ]
    )

    assert ranking.order == ["C", "B", "A"]
    assert ranking.reason == "Shortest travel time: 5 h 00 min vs 6 h 00 min on route B."


def test_tiny_differences_fall_through_to_the_next_criterion():
    # 0.02 Severe miles of interpolation noise must not outweigh an hour of driving.
    ranking = rank(
        [route("A", hours=6, low=100, severe=0.01), route("B", hours=5, low=100, severe=0.03)]
    )

    assert ranking.order == ["B", "A"]
    assert ranking.reason.startswith("Shortest travel time")


def test_identical_routes_keep_their_order():
    ranking = rank([route("A"), route("B")])

    assert ranking.order == ["A", "B"]
    assert ranking.reason == "Tied with route B on every criterion."


def test_single_route():
    assert rank([route("A")]).reason == "Only route found."


def test_rank_needs_candidates():
    with pytest.raises(ValueError):
        rank([])
