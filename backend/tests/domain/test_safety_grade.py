import pytest

from trips.domain.ranking import summarize
from trips.domain.risk import RiskLevel
from trips.domain.safety_grade import SafetyGrade, grade

LOW, MODERATE, HIGH, SEVERE, NO_TRAVEL = RiskLevel


@pytest.mark.parametrize(
    ("stretches", "expected"),
    [
        ([(100, LOW)], SafetyGrade(100, "A")),
        ([(50, LOW), (50, MODERATE)], SafetyGrade(90, "A")),
        ([(40, LOW), (60, MODERATE)], SafetyGrade(88, "B")),
        ([(100, MODERATE)], SafetyGrade(80, "B")),
        ([(90, LOW), (10, HIGH)], SafetyGrade(78, "C")),
        ([(100, HIGH)], SafetyGrade(70, "C")),
        ([(90, LOW), (10, SEVERE)], SafetyGrade(68, "D")),
        ([(99, LOW), (1, NO_TRAVEL)], SafetyGrade(58, "F")),
        ([(100, NO_TRAVEL)], SafetyGrade(0, "F")),
    ],
)
def test_worst_level_sets_the_band_and_its_share_the_score(stretches, expected):
    assert grade(summarize(stretches)) == expected


def test_any_no_travel_mile_is_an_f_however_calm_the_rest():
    assert grade(summarize([(999.8, LOW), (0.2, NO_TRAVEL)])).letter == "F"


def test_miles_too_small_to_rank_do_not_lower_the_grade():
    # Ranking ignores differences under 0.1 mi; so does the grade.
    assert grade(summarize([(100, LOW), (0.04, SEVERE)])).letter == "A"


def test_an_empty_route_is_an_a():
    assert grade(summarize([])) == SafetyGrade(100, "A")
