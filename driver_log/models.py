from django.db import models
from django.contrib.auth import get_user_model


class Trip(models.Model):
    driver = models.ForeignKey(get_user_model(), on_delete=models.CASCADE, related_name="trips", null=True, blank=True)
    start_location = models.CharField(max_length=255)
    pickup_location = models.CharField(max_length=255, blank=True, default="")
    dropoff_location = models.CharField(max_length=255)
    current_cycle_hours = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    # Assumptions
    is_property_carrying = models.BooleanField(default=True)
    adverse_conditions = models.BooleanField(default=False)
    fuel_interval_miles = models.PositiveIntegerField(default=1000)
    service_time_minutes = models.PositiveIntegerField(default=60)
    calculated_route_json = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"Trip {self.id} - {self.start_location} -> {self.dropoff_location}"


class LogEntry(models.Model):
    DUTY_CHOICES = [
        ("OFF", "Off Duty"),
        ("SB", "Sleeper Berth"),
        ("DR", "Driving"),
        ("ON", "On Duty"),
    ]

    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="log_entries")
    log_sheet_date = models.DateField()
    duty_status = models.CharField(max_length=3, choices=DUTY_CHOICES)
    start_time = models.TimeField()
    end_time = models.TimeField()
    start_location_text = models.CharField(max_length=255, blank=True, default="")
    end_location_text = models.CharField(max_length=255, blank=True, default="")
    distance_driven = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    remarks = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["log_sheet_date", "start_time"]

    def __str__(self) -> str:
        return f"{self.log_sheet_date} {self.duty_status} {self.start_time}-{self.end_time}"

# Create your models here.
