import pytest

from trips.domain.risk import (
    RiskLevel,
    apply_load_rules,
    assess,
    classify_rain,
    classify_snow,
    classify_wind,
    level_series,
)

LOW, MODERATE, HIGH, SEVERE, NO_TRAVEL = RiskLevel


@pytest.mark.parametrize(
    ("mph", "expected"),
    [
        (0, LOW),
        (24.9, LOW),
        (25, MODERATE),
        (34.9, MODERATE),
        (35, HIGH),
        (44.9, HIGH),
        (45, SEVERE),
        (54.9, SEVERE),
        (55, NO_TRAVEL),
        (80, NO_TRAVEL),
    ],
)
def test_wind_bands(mph, expected):
    assert classify_wind(mph) == expected


@pytest.mark.parametrize(
    ("in_hr", "expected"),
    [
        (0, LOW),
        (0.09, LOW),
        (0.10, MODERATE),
        (0.24, MODERATE),
        (0.25, HIGH),
        (0.49, HIGH),
        (0.50, SEVERE),
        (1.00, SEVERE),  # the table says No Travel is strictly > 1.00
        (1.01, NO_TRAVEL),
    ],
)
def test_rain_bands(in_hr, expected):
    assert classify_rain(in_hr) == expected


@pytest.mark.parametrize(
    ("in_hr", "expected"),
    [
        (0, LOW),
        (0.49, LOW),
        (0.5, MODERATE),
        (0.99, MODERATE),
        (1.0, HIGH),
        (1.99, HIGH),
        (2.0, SEVERE),
        (3.0, SEVERE),  # the table says No Travel is strictly > 3.0
        (3.01, NO_TRAVEL),
    ],
)
def test_snow_bands(in_hr, expected):
    assert classify_snow(in_hr) == expected


@pytest.mark.parametrize(
    ("mph", "load_lb", "expected"),
    [
        # >= 55 mph: No Travel for any load
        (55, 0, NO_TRAVEL),
        (60, 1_000, NO_TRAVEL),
        # 45-54 mph: No Travel only above 30,000 lb
        (45, 30_000, SEVERE),
        (45, 30_001, NO_TRAVEL),
        (54.9, 80_000, NO_TRAVEL),
        # 35-44 mph: Severe only above 40,000 lb
        (35, 40_000, HIGH),
        (35, 40_001, SEVERE),
        (44.9, 80_000, SEVERE),
        # below 35 mph: load never matters
        (34.9, 80_000, MODERATE),
        (10, 80_000, LOW),
    ],
)
def test_load_rules(mph, load_lb, expected):
    assert apply_load_rules(classify_wind(mph), load_lb) == expected


def test_overall_level_is_worst_condition():
    result = assess(wind_mph=30, rain_in_hr=0.30, snow_in_hr=2.5, load_lb=20_000)

    assert (result.wind_level, result.rain_level, result.snow_level) == (MODERATE, HIGH, SEVERE)
    assert result.level == SEVERE
    assert result.reasons == ("Snow 2.5 in/hr",)


def test_load_escalation_is_explained():
    result = assess(wind_mph=40, rain_in_hr=0, snow_in_hr=0, load_lb=45_000)

    assert result.level == SEVERE
    assert result.reasons == ("Wind 40 mph with a 45,000 lb load",)


def test_ties_list_every_deciding_condition():
    result = assess(wind_mph=36, rain_in_hr=0.3, snow_in_hr=0, load_lb=10_000)

    assert result.level == HIGH
    assert result.reasons == ("Wind 36 mph", "Rain 0.30 in/hr")


def test_low_risk_has_no_reasons():
    result = assess(wind_mph=5, rain_in_hr=0, snow_in_hr=0, load_lb=80_000)

    assert result.level == LOW
    assert result.reasons == ()


def test_level_series_matches_assess_hour_by_hour():
    wind, rain, snow = [10, 40, 50, 60], [0, 0.3, 0, 0], [0, 0, 1.5, 0]

    series = level_series(wind_mph=wind, rain_in_hr=rain, snow_in_hr=snow, load_lb=35_000)

    expected = [
        int(assess(wind_mph=w, rain_in_hr=r, snow_in_hr=s, load_lb=35_000).level)
        for w, r, s in zip(wind, rain, snow, strict=True)
    ]
    assert series == expected == [0, 2, 4, 4]


def test_level_series_rejects_misaligned_inputs():
    with pytest.raises(ValueError):
        level_series(wind_mph=[1, 2], rain_in_hr=[0], snow_in_hr=[0, 0], load_lb=0)


def test_labels():
    assert [level.label for level in RiskLevel] == [
        "Low",
        "Moderate",
        "High",
        "Severe",
        "No Travel",
    ]
