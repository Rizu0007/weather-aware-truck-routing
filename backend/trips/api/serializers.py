from rest_framework import serializers


class PlaceSearchInputSerializer(serializers.Serializer):
    q = serializers.CharField(min_length=2, max_length=100)


class PlaceOutputSerializer(serializers.Serializer):
    label = serializers.CharField()
    lat = serializers.FloatField()
    lon = serializers.FloatField()
