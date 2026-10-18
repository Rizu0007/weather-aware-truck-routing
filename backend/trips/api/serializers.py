from datetime import datetime, timedelta

from django.utils import timezone
from rest_framework import serializers

from trips.domain.geo import haversine_mi
from trips.domain.risk import RiskLevel
from trips.services.heatmap import Heatmap
from trips.services.trip_planning import CheckpointRisk, PlannedRoute, TripPlan


class PlaceSearchInputSerializer(serializers.Serializer):
    q = serializers.CharField(min_length=2, max_length=100)


class PlaceOutputSerializer(serializers.Serializer):
    label = serializers.CharField()
    lat = serializers.FloatField()
    lon = serializers.FloatField()


MIN_TRIP_MILES = 1
MAX_LOAD_LB = 80_000  # US federal gross weight limit
DEPARTURE_GRACE = timedelta(hours=1)
MAX_HEATMAP_ROUTES = 3
MAX_HEATMAP_POINTS = 10_000  # bounds the grid's CPU time


def _check_departure(value: datetime) -> datetime:
    if value < timezone.now() - DEPARTURE_GRACE:
        raise serializers.ValidationError("Departure can't be in the past.")
    return value


class PointSerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)


class TripPlanInputSerializer(serializers.Serializer):
    origin = PointSerializer()
    destination = PointSerializer()
    departure = serializers.DateTimeField()
    load_lb = serializers.IntegerField(min_value=1, max_value=MAX_LOAD_LB)
    interval_mi = serializers.ChoiceField(choices=[10, 25, 50], default=10)

    def validate_departure(self, value: datetime) -> datetime:
        return _check_departure(value)

    def validate(self, attrs: dict) -> dict:
        origin, destination = attrs["origin"], attrs["destination"]
        miles = haversine_mi(
            (origin["lon"], origin["lat"]), (destination["lon"], destination["lat"])
        )
        if miles < MIN_TRIP_MILES:
            raise serializers.ValidationError(
                {"destination": "Destination must be at least 1 mile from the origin."}
            )
        return attrs


class HeatmapInputSerializer(serializers.Serializer):
    # Route geometries from a trip plan, as [[lon, lat], ...] each.
    routes = serializers.ListField(
        child=serializers.ListField(
            child=serializers.ListField(child=serializers.FloatField(), min_length=2, max_length=2),
            min_length=2,
        ),
        min_length=1,
        max_length=MAX_HEATMAP_ROUTES,
    )
    departure = serializers.DateTimeField()
    load_lb = serializers.IntegerField(min_value=1, max_value=MAX_LOAD_LB)

    def validate_departure(self, value: datetime) -> datetime:
        return _check_departure(value)

    def validate_routes(self, routes: list) -> list:
        if sum(len(route) for route in routes) > MAX_HEATMAP_POINTS:
            raise serializers.ValidationError(f"At most {MAX_HEATMAP_POINTS} points in total.")
        for route in routes:
            for lon, lat in route:
                if not (-180 <= lon <= 180 and -90 <= lat <= 90):
                    raise serializers.ValidationError(f"Invalid coordinate [{lon}, {lat}].")
        return [[(lon, lat) for lon, lat in route] for route in routes]


def _level_key(level: RiskLevel) -> str:
    return level.name.lower()


def _iso(moment: datetime) -> str:
    return moment.replace(microsecond=0).isoformat()


class CheckpointOutputSerializer(serializers.BaseSerializer):
    def to_representation(self, risk: CheckpointRisk) -> dict:
        checkpoint, assessment = risk.checkpoint, risk.assessment
        return {
            "mile": round(checkpoint.mile, 1),
            "lon": checkpoint.coord[0],
            "lat": checkpoint.coord[1],
            "eta": _iso(checkpoint.eta),
            "covers": [round(checkpoint.start_mile, 2), round(checkpoint.end_mile, 2)],
            "wind_mph": risk.wind_mph,
            "rain_in_hr": risk.rain_in_hr,
            "snow_in_hr": risk.snow_in_hr,
            "level": _level_key(assessment.level),
            "wind_level": _level_key(assessment.wind_level),
            "rain_level": _level_key(assessment.rain_level),
            "snow_level": _level_key(assessment.snow_level),
            "reasons": list(assessment.reasons),
        }


class RouteOutputSerializer(serializers.BaseSerializer):
    def to_representation(self, route: PlannedRoute) -> dict:
        summary = route.summary
        return {
            "id": route.option.id,
            "label": f"Route {route.option.id}",
            "via_town": route.option.via_town,
            "distance_mi": round(route.distance_mi, 1),
            "duration_s": round(route.duration_s),
            "arrival": _iso(route.arrival),
            "summary": {
                "miles_by_level": {
                    _level_key(level): round(miles, 1)
                    for level, miles in summary.miles_by_level.items()
                },
                "avg_risk": round(summary.avg_risk, 2),
                "max_level": _level_key(summary.max_level),
            },
            "geometry": [list(c) for c in route.geometry],
            "segments": [
                {"level": _level_key(s.level), "coordinates": [list(c) for c in s.coordinates]}
                for s in route.segments
            ],
            "checkpoints": CheckpointOutputSerializer(route.checkpoints, many=True).data,
        }


class TripPlanOutputSerializer(serializers.BaseSerializer):
    def to_representation(self, plan: TripPlan) -> dict:
        return {
            "departure": _iso(plan.departure),
            "load_lb": plan.load_lb,
            "interval_mi": plan.interval_mi,
            "recommended_route_id": plan.ranking.order[0],
            "recommendation": {"reason": plan.ranking.reason, "ranking": plan.ranking.order},
            "warnings": plan.warnings,
            "routes": RouteOutputSerializer(plan.routes, many=True).data,
        }


def _rounded(values: list[float | None], decimals: int) -> list[float | None]:
    return [None if v is None else round(v, decimals) for v in values]


class HeatmapOutputSerializer(serializers.BaseSerializer):
    def to_representation(self, heatmap: Heatmap) -> dict:
        return {
            "start": _iso(heatmap.start),
            "hours": heatmap.hours,
            "cell_deg": heatmap.cell_deg,
            "warnings": heatmap.warnings,
            "cells": [
                {
                    "lon": cell.center[0],
                    "lat": cell.center[1],
                    "risk": cell.risk,
                    "wind_mph": _rounded(cell.wind_mph, 1),
                    "rain_in_hr": _rounded(cell.rain_in_hr, 2),
                    "snow_in_hr": _rounded(cell.snow_in_hr, 1),
                }
                for cell in heatmap.cells
            ],
        }
