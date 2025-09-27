from rest_framework import serializers
from .models import Trip, LogEntry


class LogEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = LogEntry
        fields = [
            "id",
            "trip",
            "log_sheet_date",
            "duty_status",
            "start_time",
            "end_time",
            "start_location_text",
            "end_location_text",
            "distance_driven",
            "remarks",
        ]


class TripSerializer(serializers.ModelSerializer):
    log_entries = LogEntrySerializer(many=True, read_only=True)

    class Meta:
        model = Trip
        fields = [
            "id",
            "driver",
            "start_location",
            "pickup_location",
            "dropoff_location",
            "current_cycle_hours",
            "is_property_carrying",
            "adverse_conditions",
            "fuel_interval_miles",
            "service_time_minutes",
            "calculated_route_json",
            "created_at",
            "updated_at",
            "log_entries",
        ]

