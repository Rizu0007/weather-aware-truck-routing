import pytest

from trips.domain.conditions import crosswind, driving_conditions


def conditions(**overrides):
    values = {
        "heading_deg": 0.0,  # driving north
        "wind_mph": 10.0,
        "wind_from_deg": 270.0,
        "gust_mph": None,
        "temperature_f": 60.0,
        "visibility_mi": 10.0,
        "rain_in_hr": 0.0,
        "snow_in_hr": 0.0,
        "weather_code": 0,
        "precip_probability": 0,
    }
    return driving_conditions(**(values | overrides))


@pytest.mark.parametrize(
    ("wind_from", "expected"),
    [(270, 30), (90, 30), (0, 0), (180, 0), (225, 30 * 2**-0.5)],
)
def test_crosswind_is_the_wind_across_the_road_from_either_side(wind_from, expected):
    assert crosswind(30, wind_from, heading_deg=0) == pytest.approx(expected, abs=1e-9)


def test_crosswind_uses_gusts_when_known_and_flags_from_25_mph():
    assert conditions(wind_mph=20, gust_mph=None).flags == ()
    gusty = conditions(wind_mph=20, gust_mph=25)
    assert gusty.crosswind_mph == pytest.approx(25)
    assert gusty.flags == ("crosswind",)
    # The same gust straight down the road is no crosswind.
    assert conditions(wind_mph=20, gust_mph=40, wind_from_deg=180).flags == ()


def test_no_crosswind_without_a_wind_direction():
    assert conditions(wind_from_deg=None, gust_mph=60).crosswind_mph is None


def test_freezing_needs_both_cold_and_something_falling():
    assert conditions(temperature_f=30).flags == ()
    assert conditions(temperature_f=32, rain_in_hr=0.02).flags == ("freezing",)
    assert conditions(temperature_f=28, snow_in_hr=0.3).flags == ("freezing",)
    assert conditions(temperature_f=31, weather_code=66).flags == ("freezing",)  # freezing rain
    assert conditions(temperature_f=33, rain_in_hr=0.5).flags == ()


def test_low_visibility_is_under_a_mile():
    assert conditions(visibility_mi=1.0).flags == ()
    assert conditions(visibility_mi=0.4).flags == ("low_visibility",)


def test_missing_values_raise_no_flags():
    missing = conditions(
        wind_mph=None, gust_mph=None, temperature_f=None, visibility_mi=None, weather_code=None
    )
    assert missing.flags == ()
    assert missing.crosswind_mph is None
