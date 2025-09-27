from rest_framework.routers import DefaultRouter
from .views import TripViewSet, LogEntryViewSet
from django.urls import path, include


router = DefaultRouter()
router.register(r"trips", TripViewSet, basename="trip")
router.register(r"log-entries", LogEntryViewSet, basename="logentry")

urlpatterns = [
    path("", include(router.urls)),
]

