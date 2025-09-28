from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from .models import Trip, LogEntry
from .serializers import TripSerializer, LogEntrySerializer
from datetime import datetime, date, time, timedelta
from math import floor
import requests
import os


def get_pickup_distance_miles(start_location, pickup_location):
    """
    Calculate the distance in miles from start location to pickup location using Google Maps API
    """
    try:
        # Get Google Maps API key from environment
        api_key = os.getenv('GOOGLE_MAPS_API_KEY')
        if not api_key:
            print("No Google Maps API key found, using estimated distance")
            return 50.0  # Default estimate
        
        # Use Google Maps Distance Matrix API
        url = "https://maps.googleapis.com/maps/api/distancematrix/json"
        params = {
            'origins': start_location,
            'destinations': pickup_location,
            'units': 'imperial',
            'key': api_key
        }
        
        response = requests.get(url, params=params)
        data = response.json()
        
        if data['status'] == 'OK' and data['rows'][0]['elements'][0]['status'] == 'OK':
            distance_text = data['rows'][0]['elements'][0]['distance']['text']
            # Extract miles from text like "50.2 mi"
            distance_miles = float(distance_text.replace(' mi', '').replace(',', ''))
            print(f"Google Maps calculated distance: {distance_miles:.1f} miles")
            return distance_miles
        else:
            print(f"Google Maps API error: {data}")
            return 50.0  # Default estimate
            
    except Exception as e:
        print(f"Error calculating pickup distance: {e}")
        return 50.0  # Default estimate

def get_city_state_from_address(address, api_key):
    """
    Convert a full address to city, state format using Google Maps Geocoding API
    """
    try:
        import requests
        
        geocode_url = "https://maps.googleapis.com/maps/api/geocode/json"
        geocode_params = {
            'address': address,
            'key': api_key
        }
        
        geocode_response = requests.get(geocode_url, params=geocode_params)
        geocode_data = geocode_response.json()
        
        if geocode_data['status'] == 'OK' and geocode_data['results']:
            result = geocode_data['results'][0]
            city = ""
            state = ""
            
            for component in result['address_components']:
                if 'locality' in component['types']:
                    city = component['long_name']
                elif 'administrative_area_level_1' in component['types']:
                    state = component['short_name']
            
            if city and state:
                return f"{city}, {state}"
            else:
                # Try to extract city, state from formatted address
                formatted_address = result['formatted_address']
                import re
                match = re.search(r'([^,]+),\s*([A-Z]{2})', formatted_address)
                if match:
                    return f"{match.group(1).strip()}, {match.group(2)}"
                else:
                    return formatted_address
        
        return address  # Fallback to original address
        
    except Exception as e:
        print(f"Error converting address to city, state: {e}")
        return address

def get_location_name_from_route(distance_miles, start_location, pickup_location, dropoff_location, total_distance_miles):
    """
    Get the actual location name at a specific distance along the route using Google Maps API
    """
    try:
        # Get Google Maps API key from environment
        api_key = os.getenv('GOOGLE_MAPS_API_KEY')
        if not api_key:
            return f"Location at {distance_miles:.1f} miles"
        
        # Calculate which segment of the route we're in
        if distance_miles <= 0:
            # Process start location to get city, state format
            return get_city_state_from_address(start_location, api_key)
        elif distance_miles >= total_distance_miles:
            # Process dropoff location to get city, state format
            return get_city_state_from_address(dropoff_location, api_key)
        
        # Determine if we're on the A->B segment (to pickup) or B->C segment (pickup to dropoff)
        start_to_pickup_miles = get_pickup_distance_miles(start_location, pickup_location)
        
        if distance_miles <= start_to_pickup_miles:
            # We're on the A->B segment (start to pickup)
            # Use Google Maps Directions API to get waypoints along the route
            import requests
            
            url = "https://maps.googleapis.com/maps/api/directions/json"
            params = {
                'origin': start_location,
                'destination': pickup_location,
                'key': api_key,
            }
            
            response = requests.get(url, params=params)
            data = response.json()
            
            if data['status'] == 'OK' and data['routes']:
                route = data['routes'][0]
                legs = route['legs']
                
                # Calculate total distance of the leg
                leg_distance = 0
                for step in legs[0]['steps']:
                    leg_distance += step['distance']['value']  # distance in meters
                
                # Find the step that contains our target distance
                target_distance_meters = distance_miles * 1609.34  # convert miles to meters
                current_distance = 0
                
                for step in legs[0]['steps']:
                    step_distance = step['distance']['value']
                    if current_distance + step_distance >= target_distance_meters:
                        # We found the step containing our target distance
                        # Get the end location of this step
                        end_location = step['end_location']
                        
                        # Use reverse geocoding to get the address
                        geocode_url = "https://maps.googleapis.com/maps/api/geocode/json"
                        geocode_params = {
                            'latlng': f"{end_location['lat']},{end_location['lng']}",
                            'key': api_key
                        }
                        
                        geocode_response = requests.get(geocode_url, params=geocode_params)
                        geocode_data = geocode_response.json()
                        
                        if geocode_data['status'] == 'OK' and geocode_data['results']:
                            result = geocode_data['results'][0]
                            # Extract city and state from the address components
                            city = ""
                            state = ""
                            
                            for component in result['address_components']:
                                if 'locality' in component['types']:
                                    city = component['long_name']
                                elif 'administrative_area_level_1' in component['types']:
                                    state = component['short_name']
                            
                            if city and state:
                                return f"{city}, {state}"
                            else:
                                # Try to extract city, state from formatted address
                                formatted_address = result['formatted_address']
                                # Look for common patterns like "City, State" or "City, State ZIP"
                                import re
                                match = re.search(r'([^,]+),\s*([A-Z]{2})', formatted_address)
                                if match:
                                    return f"{match.group(1).strip()}, {match.group(2)}"
                                else:
                                    return formatted_address
                        
                        break
                    current_distance += step_distance
        else:
            # We're on the B->C segment (pickup to dropoff)
            # Calculate the percentage along this segment
            segment_distance = distance_miles - start_to_pickup_miles
            pickup_to_dropoff_miles = get_pickup_distance_miles(pickup_location, dropoff_location)
            
            # Use similar logic for the pickup to dropoff segment
            import requests
            
            url = "https://maps.googleapis.com/maps/api/directions/json"
            params = {
                'origin': pickup_location,
                'destination': dropoff_location,
                'key': api_key,
            }
            
            response = requests.get(url, params=params)
            data = response.json()
            
            if data['status'] == 'OK' and data['routes']:
                route = data['routes'][0]
                legs = route['legs']
                
                # Calculate total distance of the leg
                leg_distance = 0
                for step in legs[0]['steps']:
                    leg_distance += step['distance']['value']
                
                # Find the step that contains our target distance
                target_distance_meters = segment_distance * 1609.34
                current_distance = 0
                
                for step in legs[0]['steps']:
                    step_distance = step['distance']['value']
                    if current_distance + step_distance >= target_distance_meters:
                        end_location = step['end_location']
                        
                        # Use reverse geocoding
                        geocode_url = "https://maps.googleapis.com/maps/api/geocode/json"
                        geocode_params = {
                            'latlng': f"{end_location['lat']},{end_location['lng']}",
                            'key': api_key
                        }
                        
                        geocode_response = requests.get(geocode_url, params=geocode_params)
                        geocode_data = geocode_response.json()
                        
                        if geocode_data['status'] == 'OK' and geocode_data['results']:
                            result = geocode_data['results'][0]
                            city = ""
                            state = ""
                            
                            for component in result['address_components']:
                                if 'locality' in component['types']:
                                    city = component['long_name']
                                elif 'administrative_area_level_1' in component['types']:
                                    state = component['short_name']
                            
                            if city and state:
                                return f"{city}, {state}"
                            else:
                                # Try to extract city, state from formatted address
                                formatted_address = result['formatted_address']
                                # Look for common patterns like "City, State" or "City, State ZIP"
                                import re
                                match = re.search(r'([^,]+),\s*([A-Z]{2})', formatted_address)
                                if match:
                                    return f"{match.group(1).strip()}, {match.group(2)}"
                                else:
                                    return formatted_address
                        
                        break
                    current_distance += step_distance
        
        # Fallback if API calls fail
        return f"Location at {distance_miles:.1f} miles"
            
    except Exception as e:
        print(f"Error getting location name: {e}")
        return f"Location at {distance_miles:.1f} miles"


class TripViewSet(viewsets.ModelViewSet):
    queryset = Trip.objects.all().order_by("-created_at")
    serializer_class = TripSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        trip: Trip = serializer.save()

        # Inputs optionally provided by frontend for more accurate planning
        duration_seconds = int(request.data.get("duration_seconds") or request.data.get("durationSeconds") or 0)
        distance_meters = int(request.data.get("distance_meters") or request.data.get("distanceMeters") or 0)
        start_date_iso = request.data.get("start_date_iso") or request.data.get("startDateISO") or date.today().isoformat()
        start_time_local = (request.data.get("start_time_local") or "08:00").strip()

        # Derive approximate values if missing
        if distance_meters and not duration_seconds:
            # assume 55 mph average
            miles = distance_meters * 0.000621371
            hours = miles / 55.0
            duration_seconds = int(hours * 3600)
        if duration_seconds and not distance_meters:
            # assume 55 mph average
            miles = (duration_seconds / 3600) * 55.0
            distance_meters = int(miles / 0.000621371)

        # Calculate all distances using Google Maps API
        # Expect GOOGLE_MAPS_API_KEY to be set in environment (see README.md)
        
        # Get exact distances for all segments
        start_to_pickup_miles = 0
        pickup_to_dropoff_miles = 0
        total_distance_miles = 0
        
        if trip.pickup_location and trip.pickup_location.strip():
            start_to_pickup_miles = get_pickup_distance_miles(trip.start_location, trip.pickup_location)
            pickup_to_dropoff_miles = get_pickup_distance_miles(trip.pickup_location, trip.dropoff_location)
            total_distance_miles = start_to_pickup_miles + pickup_to_dropoff_miles
            print(f"Distance breakdown:")
            print(f"  Start → Pickup: {start_to_pickup_miles:.1f} miles")
            print(f"  Pickup → Dropoff: {pickup_to_dropoff_miles:.1f} miles")
            print(f"  Total distance: {total_distance_miles:.1f} miles")
        else:
            # No pickup location, use direct distance
            total_distance_miles = distance_meters * 0.000621371
            print(f"Direct distance: {total_distance_miles:.1f} miles")
        
        # Calculate pure driving hours based on actual distances (55 mph average)
        pure_driving_hours = total_distance_miles / 55.0
        pure_driving_seconds = int(pure_driving_hours * 3600)
        print(f"Pure driving time: {pure_driving_hours:.1f} hours")

        # HOS parameters (simplified)
        is_property = trip.is_property_carrying
        max_drive_per_day_hours = 8.75 if is_property else 8.75  # 70/8 cycle = 8.75 hours per day
        break_after_drive_hours = 8 if is_property else 8  # both categories have 30-min after 8h driving
        off_duty_min_hours = 10 if is_property else 8
        max_on_duty_window_hours = 14 if is_property else 14
        service_minutes = trip.service_time_minutes
        
        # Define constants for the step-by-step calculation
        daily_work_time = 8.75  # hours
        driving_speed = 55  # mph
        refuel_stop_time = 0.25  # hours (15 minutes)
        loading_stop_time = 1.0  # hours (pickup/dropoff)
        daily_start_time = 8.0  # 8:00 AM
        
        # Calculate fuel stops every 1000 miles from start
        fuel_interval_miles = 1000  # Fixed at 1000 miles
        fuel_stop_seconds_each = 15 * 60  # 15 minutes each
        
        # Calculate fuel stops based on total distance
        estimated_fuel_stops = floor(total_distance_miles / fuel_interval_miles)
        fuel_stop_seconds_total = estimated_fuel_stops * fuel_stop_seconds_each
        
        # Identify milestones
        milestones = []
        if start_to_pickup_miles > 0:
            milestones.append({"type": "pickup", "distance": start_to_pickup_miles, "time": loading_stop_time})
        
        # Add fuel stops at 1000, 2000, 3000, etc.
        for i in range(1, estimated_fuel_stops + 1):
            fuel_distance = i * fuel_interval_miles
            if fuel_distance < total_distance_miles:
                milestones.append({"type": "fuel", "distance": fuel_distance, "time": refuel_stop_time})
        
        # Add dropoff milestone
        milestones.append({"type": "dropoff", "distance": total_distance_miles, "time": loading_stop_time})
        
        # Sort milestones by distance
        milestones.sort(key=lambda x: x["distance"])
        print(f"Milestones: {milestones}")
        
        # Calculate service time (pickup + dropoff)
        service_time_seconds = (service_minutes * 60) * 2  # pickup + dropoff
        
        print(f"Fuel stops: {estimated_fuel_stops} stops every {fuel_interval_miles} miles")
        print(f"Service time: {service_time_seconds/60:.0f} minutes (pickup + dropoff)")
        print(f"Total additional time: {(fuel_stop_seconds_total + service_time_seconds)/60:.0f} minutes")
        
        # Build segments across days
        # Strategy: For each day, include service times (pickup on day 1, drop-off on last day),
        # schedule 30-min break after 8h driving, keep within 14h duty window, then 10h OFF.
        remaining_drive_seconds = pure_driving_seconds
        segments: list[LogEntry] = []
        # Build start datetime with provided local HH:MM (treated as naive)
        try:
            hh, mm = [int(x) for x in start_time_local.split(":", 1)]
        except Exception:
            hh, mm = 8, 0
        d0 = datetime.fromisoformat(start_date_iso)
        start_dt = datetime(d0.year, d0.month, d0.day, hh, mm)
        day_cursor = datetime(start_dt.year, start_dt.month, start_dt.day)
        fuel_stops_remaining = estimated_fuel_stops
        
        # Track daily progress for multi-day sheets
        daily_progress = []
        # Get city, state format for start location
        start_location_name = get_location_name_from_route(0, trip.start_location, trip.pickup_location, trip.dropoff_location, total_distance_miles)
        current_location = start_location_name
        total_distance_covered = 0
        day_index = 0  # Track current day index
        cumulative_distance = 0  # Track total distance across all days
        milestone_index = 0  # Track which milestone we're working towards
        
        # Step-by-step daily calculation
        while total_distance_covered < total_distance_miles:
            # Simple check: if we've reached the total distance, stop creating new days
            if total_distance_covered >= total_distance_miles:
                break
                
            day_start = day_cursor
            day_end = day_start + timedelta(days=1)
            
            # Start each day at midnight, add OFF-duty time until 8:00 AM
            day_start_midnight = datetime(day_start.year, day_start.month, day_start.day, 0, 0)
            duty_window_start = datetime(day_start.year, day_start.month, day_start.day, 8, 0)
            
            # Add OFF-duty time from midnight to 8:00 AM for ALL days
            segments.append(LogEntry(
                trip=trip,
                log_sheet_date=day_start.date(),
                duty_status="OFF",
                start_time=time(0, 0),
                end_time=time(8, 0),
            ))
            print(f"Day {day_index + 1}: OFF-duty from 00:00 to 08:00")
            
            t = duty_window_start
            
            # Daily work time budget
            remaining_time_today = daily_work_time
            daily_distance_covered = 0
            
            print(f"Day {day_index + 1}: Starting driving at {t.strftime('%H:%M')} with {remaining_time_today:.2f} hours available")
            print(f"Current cumulative distance: {total_distance_covered:.1f} miles")
            
            # Process milestones for this day
            while remaining_time_today > 0 and milestone_index < len(milestones):
                milestone = milestones[milestone_index]
                distance_to_milestone = milestone["distance"] - total_distance_covered
                
                if distance_to_milestone <= 0:
                    # Already passed this milestone, skip it
                    milestone_index += 1
                    continue
                
                # Calculate time needed to reach this milestone
                drive_time_to_milestone = distance_to_milestone / driving_speed
                total_time_for_milestone = drive_time_to_milestone + milestone["time"]
                
                print(f"  Milestone {milestone_index + 1}: {milestone['type']} at {milestone['distance']} miles")
                print(f"    Distance to milestone: {distance_to_milestone:.1f} miles")
                print(f"    Drive time: {drive_time_to_milestone:.2f} hours")
                print(f"    Stop time: {milestone['time']:.2f} hours")
                print(f"    Total time needed: {total_time_for_milestone:.2f} hours")
                print(f"    Remaining time today: {remaining_time_today:.2f} hours")
                
                if total_time_for_milestone <= remaining_time_today:
                    # Can complete this milestone today
                    print(f"    ✓ Can complete milestone today")
                    
                    # Drive to milestone
                    drive_end = t + timedelta(hours=drive_time_to_milestone)
                    segments.append(LogEntry(
                        trip=trip,
                        log_sheet_date=day_start.date(),
                        duty_status="DR",
                        start_time=time(t.hour, t.minute),
                        end_time=time(drive_end.hour, drive_end.minute),
                    ))
                    t = drive_end
                    daily_distance_covered += distance_to_milestone
                    total_distance_covered += distance_to_milestone
                    remaining_time_today -= drive_time_to_milestone
                    
                    # Add milestone stop
                    stop_end = t + timedelta(hours=milestone["time"])
                    duty_status = "ON" if milestone["type"] in ["pickup", "dropoff"] else "ON"
                    remarks = f"{milestone['type'].title()} service" if milestone["type"] in ["pickup", "dropoff"] else f"Fuel stop at {milestone['distance']} miles"
                    
                    segments.append(LogEntry(
                        trip=trip,
                        log_sheet_date=day_start.date(),
                        duty_status=duty_status,
                        start_time=time(t.hour, t.minute),
                        end_time=time(stop_end.hour, stop_end.minute),
                        start_location_text=trip.pickup_location if milestone["type"] == "pickup" else "",
                        end_location_text=trip.pickup_location if milestone["type"] == "pickup" else "",
                        distance_driven=0,
                        remarks=remarks
                    ))
                    t = stop_end
                    remaining_time_today -= milestone["time"]
                    
                    print(f"    Completed at {t.strftime('%H:%M')}")
                    milestone_index += 1

                    # If the next milestone is at the exact same distance, process it immediately
                    # This allows pickup and fuel (or any combo) at the same mile to be logged separately
                    while (
                        milestone_index < len(milestones)
                        and abs(milestones[milestone_index]["distance"] - total_distance_covered) < 1e-6
                        and remaining_time_today > 0
                    ):
                        same_milestone = milestones[milestone_index]
                        print(f"    Processing same-distance milestone: {same_milestone['type']} at {same_milestone['distance']} miles")
                        if same_milestone["time"] <= remaining_time_today:
                            same_stop_end = t + timedelta(hours=same_milestone["time"])
                            same_duty_status = "ON"  # both pickup/dropoff and fuel are ON-duty not driving
                            same_remarks = (
                                f"{same_milestone['type'].title()} service" if same_milestone["type"] in ["pickup", "dropoff"]
                                else f"Fuel stop at {same_milestone['distance']} miles"
                            )
                            segments.append(LogEntry(
                                trip=trip,
                                log_sheet_date=day_start.date(),
                                duty_status=same_duty_status,
                                start_time=time(t.hour, t.minute),
                                end_time=time(same_stop_end.hour, same_stop_end.minute),
                                start_location_text=trip.pickup_location if same_milestone["type"] == "pickup" else "",
                                end_location_text=trip.pickup_location if same_milestone["type"] == "pickup" else "",
                                distance_driven=0,
                                remarks=same_remarks
                            ))
                            t = same_stop_end
                            remaining_time_today -= same_milestone["time"]
                            milestone_index += 1
                            print(f"    Same-distance milestone completed at {t.strftime('%H:%M')}")
                        else:
                            # Not enough time today for this same-distance stop; end day
                            print(f"    Not enough time for same-distance stop today; deferring")
                            break
                    
                    # If we completed the dropoff milestone, the trip is done
                    if milestone["type"] == "dropoff":
                        print(f"    Trip completed! Reached dropoff at {total_distance_covered:.1f} miles")
                        # Don't add OFF-duty here - let the main loop handle it
                        
                        # Store final daily progress
                        dropoff_location_name = get_location_name_from_route(total_distance_miles, trip.start_location, trip.pickup_location, trip.dropoff_location, total_distance_miles)
                        daily_progress.append({
                            "date": day_start.date().isoformat(),
                            "start_location": current_location,
                            "end_location": dropoff_location_name,
                            "daily_distance": daily_distance_covered,
                            "cumulative_distance": total_distance_covered,
                            "driving_hours": daily_distance_covered / driving_speed
                        })
                        
                        # Break out of milestone loop
                        remaining_time_today = 0
                        total_distance_covered = total_distance_miles  # Set to exact total
                        break
                    
                else:
                    # Cannot complete milestone today, just drive for remaining time
                    print(f"    ✗ Cannot complete milestone today, driving for remaining time")
                    
                    # Special handling for dropoff milestone - don't exceed total distance
                    if milestone["type"] == "dropoff":
                        # Drive only as far as needed to reach dropoff
                        distance_to_dropoff = milestone["distance"] - total_distance_covered
                        if distance_to_dropoff > 0:
                            drive_time_to_dropoff = distance_to_dropoff / driving_speed
                            if drive_time_to_dropoff <= remaining_time_today:
                                # Can reach dropoff today
                                drive_end = t + timedelta(hours=drive_time_to_dropoff)
                                segments.append(LogEntry(
                                    trip=trip,
                                    log_sheet_date=day_start.date(),
                                    duty_status="DR",
                                    start_time=time(t.hour, t.minute),
                                    end_time=time(drive_end.hour, drive_end.minute),
                                ))
                                t = drive_end
                                daily_distance_covered += distance_to_dropoff
                                total_distance_covered += distance_to_dropoff
                                remaining_time_today -= drive_time_to_dropoff
                                
                                # Add dropoff service
                                stop_end = t + timedelta(hours=milestone["time"])
                                segments.append(LogEntry(
                                    trip=trip,
                                    log_sheet_date=day_start.date(),
                                    duty_status="ON",
                                    start_time=time(t.hour, t.minute),
                                    end_time=time(stop_end.hour, stop_end.minute),
                                    start_location_text=trip.dropoff_location,
                                    end_location_text=trip.dropoff_location,
                                    distance_driven=0,
                                    remarks="Dropoff service"
                                ))
                                t = stop_end
                                remaining_time_today -= milestone["time"]
                                
                                print(f"    ✓ Reached dropoff at {total_distance_covered:.1f} miles")
                                print(f"    Trip completed! Reached dropoff at {total_distance_covered:.1f} miles")
                                
                                # Store final daily progress
                                dropoff_location_name = get_location_name_from_route(total_distance_miles, trip.start_location, trip.pickup_location, trip.dropoff_location, total_distance_miles)
                                daily_progress.append({
                                    "date": day_start.date().isoformat(),
                                    "start_location": current_location,
                                    "end_location": dropoff_location_name,
                                    "daily_distance": daily_distance_covered,
                                    "cumulative_distance": total_distance_covered,
                                    "driving_hours": daily_distance_covered / driving_speed
                                })
                                
                                # Break out of milestone loop
                                # Don't set remaining_time_today = 0, let main loop handle OFF-duty
                                total_distance_covered = total_distance_miles  # Set to exact total
                                break
                            else:
                                # Cannot reach dropoff today, drive for remaining time
                                distance_this_time = remaining_time_today * driving_speed
                                drive_end = t + timedelta(hours=remaining_time_today)
                                segments.append(LogEntry(
                                    trip=trip,
                                    log_sheet_date=day_start.date(),
                                    duty_status="DR",
                                    start_time=time(t.hour, t.minute),
                                    end_time=time(drive_end.hour, drive_end.minute),
                                ))
                                t = drive_end
                                daily_distance_covered += distance_this_time
                                total_distance_covered += distance_this_time
                                remaining_time_today = 0
                                print(f"  Drove for remaining {remaining_time_today:.2f} hours: {distance_this_time:.1f} miles")
                                break # End day
                        else:
                            # Already at or past dropoff
                            print(f"    Already at dropoff location")
                            break
                    else:
                        # For other milestones, drive for remaining time
                        distance_this_time = remaining_time_today * driving_speed
                        drive_end = t + timedelta(hours=remaining_time_today)
                        segments.append(LogEntry(
                            trip=trip,
                            log_sheet_date=day_start.date(),
                            duty_status="DR",
                            start_time=time(t.hour, t.minute),
                            end_time=time(drive_end.hour, drive_end.minute),
                        ))
                        t = drive_end
                        daily_distance_covered += distance_this_time
                        total_distance_covered += distance_this_time
                        remaining_time_today = 0
                        print(f"  Drove for remaining {remaining_time_today:.2f} hours: {distance_this_time:.1f} miles")
                        break # End day
            
            # Check if trip is completed after milestone processing
            if total_distance_covered >= total_distance_miles:
                print(f"Trip completed in milestone loop! Total distance: {total_distance_covered:.1f} miles")
                # Don't break here, let main loop add OFF-duty entry first
            
            # If we have remaining time and no more milestones, drive for remaining time
            if remaining_time_today > 0 and milestone_index >= len(milestones):
                # Drive for remaining time
                distance_this_time = remaining_time_today * driving_speed
                drive_end = t + timedelta(hours=remaining_time_today)
                segments.append(LogEntry(
                    trip=trip,
                    log_sheet_date=day_start.date(),
                    duty_status="DR",
                    start_time=time(t.hour, t.minute),
                    end_time=time(drive_end.hour, drive_end.minute),
                ))
                t = drive_end
                daily_distance_covered += distance_this_time
                total_distance_covered += distance_this_time
                remaining_time_today = 0
                print(f"  Drove for remaining {remaining_time_today:.2f} hours: {distance_this_time:.1f} miles")
            
            # Add off-duty time for remainder of day
            off_end = datetime(day_start.year, day_start.month, day_start.day, 23, 59)
            segments.append(LogEntry(
                trip=trip,
                log_sheet_date=day_start.date(),
                duty_status="OFF",
                start_time=time(t.hour, t.minute),
                end_time=time(off_end.hour, off_end.minute),
            ))
            
            # Check if trip is completed after adding OFF-duty entry
            if total_distance_covered >= total_distance_miles:
                print(f"Trip completed after OFF-duty entry! Total distance: {total_distance_covered:.1f} miles")
                break
            
            print(f"Day {day_index + 1} completed: {daily_distance_covered:.1f} miles, cumulative: {total_distance_covered:.1f} miles")
            
            # Store daily progress
            end_location_name = get_location_name_from_route(
                total_distance_covered, 
                trip.start_location, 
                trip.pickup_location, 
                trip.dropoff_location, 
                total_distance_miles
            )
            daily_progress.append({
                "date": day_start.date().isoformat(),
                "start_location": current_location,
                "end_location": end_location_name,
                "daily_distance": daily_distance_covered,
                "cumulative_distance": total_distance_covered,
                "driving_hours": daily_distance_covered / driving_speed
            })
            
            # Update current_location for the next day's start_location
            current_location = end_location_name
            
            # Check if trip is completed
            if total_distance_covered >= total_distance_miles:
                print(f"Trip completed! Total distance: {total_distance_covered:.1f} miles")
                break
                
            # Advance to next day
            day_cursor = day_cursor + timedelta(days=1)
            day_index += 1

        # Persist entries
        print(f"Creating {len(segments)} log entries")
        for i, segment in enumerate(segments):
            print(f"Entry {i+1}: {segment.duty_status} {segment.start_time}-{segment.end_time} {segment.remarks}")
        LogEntry.objects.bulk_create(segments)

        # Summarize
        hours = round(duration_seconds / 3600)
        miles = round(total_distance_miles)
        arrival_dt = start_dt + timedelta(seconds=duration_seconds)
        trip.calculated_route_json = {
            "summary": {
                "distance": f"{miles} mi",
                "duration": f"{hours}h",
                "stops": estimated_fuel_stops,
                "arrival": arrival_dt.isoformat(),
            },
            "daily_progress": daily_progress
        }
        trip.save(update_fields=["calculated_route_json"])

        headers = self.get_success_headers(serializer.data)
        return Response(TripSerializer(trip).data, status=status.HTTP_201_CREATED, headers=headers)

    @action(detail=True, methods=["get"])
    def logsheets(self, request, pk=None):
        trip = self.get_object()
        entries = trip.log_entries.all()
        return Response(LogEntrySerializer(entries, many=True).data)


class LogEntryViewSet(viewsets.ModelViewSet):
    queryset = LogEntry.objects.all()
    serializer_class = LogEntrySerializer


