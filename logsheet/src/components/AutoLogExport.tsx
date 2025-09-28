/*
  Intention: This page plans a trip using Google Maps, gathers inputs, estimates or requests HOS log entries
  from a Django backend, caches intermediate state, and then navigates to the PDF overlay page to export.

  High-level responsibilities:
  - Initialize Google Maps (map, directions, autocomplete, layers) and wire UI inputs to form state.
  - Compute/display an overview (distance, duration, stops, arrival) and request detailed logs from backend.
  - Persist form and route snippets in a cache and localStorage, so users can resume workflow.
  - Redirect to `/overlay` with computed progress so `PdfOverlayPage` can render and export.

  Linting note: Keep console logs for debugging/tracing; allow `any` where Google Maps or 3rd-party types apply.
*/
/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadGoogleMaps } from '../utils/googleMaps';
import type { LogEntry } from '../types/logsheet';
import CacheManager from '../utils/CacheManager';

// Intention: Declare the `google` namespace so TS accepts Maps usage from the global loader
declare global {
  interface Window {
    google: { maps: any };
  }
}

// Intention: Form model that drives routing requests and backend parameters
type PlannerForm = {
	currentLocation: string;
	pickupLocation: string;
	destination: string;
	cycle: '60/7' | '70/8';
	cycleHours: number;
	startDateISO: string;
	startTimeLocal: string; // HH:MM
 	// Assumptions
 	isPropertyCarrying: boolean;
 	adverseConditions: boolean;
 	fuelIntervalMiles: number; // fueling at least once every N miles
 	serviceTimeMinutes: number; // pickup/drop-off service time in minutes
};

// Intention: Provide sensible defaults to speed up first interaction
const defaultPlanner: PlannerForm = {
	currentLocation: '',
	pickupLocation: '',
	destination: '',
	cycle: '70/8',
	cycleHours: 0,
	startDateISO: new Date().toISOString().slice(0, 10),
	startTimeLocal: '08:00',
 	isPropertyCarrying: true,
 	adverseConditions: false,
 	fuelIntervalMiles: 1000,
 	serviceTimeMinutes: 60,
};

// Intention: Fallback segmentation when backend is unavailable; ensures overlay never appears empty
function estimateDailySegments(totalSeconds: number): Array<{ startUtc: string; endUtc: string; status: LogEntry['status'] }>[] {
	// Very naive HOS stub: split into 8h drive + 2h on + 14h off per day
	// Returns an array for each day
	const daySeconds = 24 * 3600;
	const results: Array<Array<{ startUtc: string; endUtc: string; status: LogEntry['status'] }>> = [];
	let remaining = totalSeconds;
	let dayStart = new Date();
	dayStart.setUTCHours(0, 0, 0, 0);
	let dayIndex = 0;
	while (remaining > 0 && dayIndex < 14) {
		const daySegments: Array<{ startUtc: string; endUtc: string; status: LogEntry['status'] }> = [];
		const base = new Date(dayStart.getTime() + dayIndex * daySeconds * 1000);
		let cursor = new Date(base);
		// OFF 00:00-08:00
		let seg = 8 * 3600;
		daySegments.push({ startUtc: cursor.toISOString(), endUtc: new Date(cursor.getTime() + seg * 1000).toISOString(), status: 'OFF' });
		cursor = new Date(cursor.getTime() + seg * 1000);
		// D 08:00-12:00 (4h)
		seg = Math.min(4 * 3600, remaining);
		daySegments.push({ startUtc: cursor.toISOString(), endUtc: new Date(cursor.getTime() + seg * 1000).toISOString(), status: 'D' });
		remaining -= seg;
		cursor = new Date(cursor.getTime() + seg * 1000);
		if (remaining <= 0) {
			// Fill the rest of the day OFF
			daySegments.push({ startUtc: cursor.toISOString(), endUtc: new Date(base.getTime() + daySeconds * 1000).toISOString(), status: 'OFF' });
			results.push(daySegments);
			break;
		}
		// ON 12:00-14:00 (2h)
		seg = 2 * 3600;
		daySegments.push({ startUtc: cursor.toISOString(), endUtc: new Date(cursor.getTime() + seg * 1000).toISOString(), status: 'ON' });
		cursor = new Date(cursor.getTime() + seg * 1000);
		// D 14:00-18:00 (4h)
		seg = Math.min(4 * 3600, remaining);
		daySegments.push({ startUtc: cursor.toISOString(), endUtc: new Date(cursor.getTime() + seg * 1000).toISOString(), status: 'D' });
		remaining -= seg;
		cursor = new Date(cursor.getTime() + seg * 1000);
		// OFF rest of day
		daySegments.push({ startUtc: cursor.toISOString(), endUtc: new Date(base.getTime() + daySeconds * 1000).toISOString(), status: 'OFF' });
		results.push(daySegments);
		dayIndex += 1;
	}
	return results;
}



export const AutoLogExport: React.FC = () => {
	const [gmaps, setGmaps] = useState<any | null>(null);
	const [form, setForm] = useState<PlannerForm>(defaultPlanner);
	const [activeTab, setActiveTab] = useState<'summary' | 'logs'>('summary');
	const [isCalculating, setIsCalculating] = useState(false);
	const [routeData, setRouteData] = useState<{
		distance: number;
		duration: number;
		stops: number;
		arrival: string;
	} | null>(null);
	const [showRouteInfo, setShowRouteInfo] = useState(true);
	const cacheManager = CacheManager.getInstance();
  const mapRef = useRef<HTMLDivElement | null>(null);
	const mapInstance = useRef<any | null>(null);
	const directionsService = useRef<any | null>(null);
	const directionsRenderer = useRef<any | null>(null);
  const currentInputRef = useRef<HTMLInputElement | null>(null);
  const pickupInputRef = useRef<HTMLInputElement | null>(null);
	const destinationInputRef = useRef<HTMLInputElement | null>(null);
	const currentMarkerRef = useRef<any | null>(null);
	const pickupMarkerRef = useRef<any | null>(null);
	const selectionMarkerRef = useRef<any | null>(null);
	const selectedLatLngRef = useRef<any | null>(null);
	const destinationMarkerRef = useRef<any | null>(null);
	const trafficLayerRef = useRef<any | null>(null);
	const transitLayerRef = useRef<any | null>(null);
	const geocoderRef = useRef<any | null>(null);

	useEffect(() => {
		// Ensure we start at the very top
		window.scrollTo(0, 0);
		document.documentElement.scrollTop = 0; // html
		document.body.scrollTop = 0;            // body (for Safari/older browsers)
	  
		const prevBody = document.body.style.overflow;
		const prevHtml = document.documentElement.style.overflow;
		document.body.style.overflow = 'hidden';
		document.documentElement.style.overflow = 'hidden';
	  
		return () => {
		  document.body.style.overflow = prevBody;
		  document.documentElement.style.overflow = prevHtml;
		};
	  }, []);

	// Load saved form from cache on mount
	useEffect(() => {
		try {
			const cached = cacheManager.getAutoLogExportCache();
			console.log('AutoLogExport: Loading from cache:', cached);
			
			if (cached.form && Object.keys(cached.form).length > 0) {
				console.log('Restoring form from cache:', cached.form);
				setForm(cached.form);
			}
			
			if (cached.routeData) {
				console.log('Restoring route data from cache:', cached.routeData);
				setRouteData(cached.routeData);
			}
			
			// Debug cache status
			cacheManager.logCacheStatus();
		} catch (error) {
			console.error('Error loading from cache:', error);
		}
	}, []); // Empty dependency array - only run on mount

	// Persist form changes to cache
	useEffect(() => {
		try {
			console.log('Saving form to cache:', form);
			cacheManager.setAutoLogExportCache({ form });
		} catch (error) {
			console.error('Error saving form to cache:', error);
		}
	}, [form]); // Only depend on form changes

  // Intention: Disable global scroll and ensure viewport starts at top while this page is active
  useEffect(() => {
		loadGoogleMaps(['places']).then((maps) => {
			setGmaps(maps);
			if (mapRef.current) {
				mapInstance.current = new maps.Map(mapRef.current, {
					center: new maps.LatLng(39.8283, -98.5795), // USA center
					zoom: 4,
					mapTypeControl: true,
					streetViewControl: false,
					fullscreenControl: false
				});
				directionsService.current = new maps.DirectionsService();
				directionsRenderer.current = new maps.DirectionsRenderer({ map: mapInstance.current });
				trafficLayerRef.current = new maps.TrafficLayer();
				transitLayerRef.current = new maps.TransitLayer();
				geocoderRef.current = new maps.Geocoder();
				// default POIs/businesses are visible on the base map
				
				// Restore cached map route if available
				const cached = cacheManager.getAutoLogExportCache();
				if (cached.mapRoute && cached.mapRoute.rendered && cached.mapRoute.directions) {
					try {
						directionsRenderer.current.setDirections(cached.mapRoute.directions);
						console.log('Restored cached map route');
					} catch (error) {
						console.warn('Failed to restore cached map route:', error);
					}
				}
			}
			// Autocomplete with listeners to set formatted address
			if (currentInputRef.current) {
				const ac = new maps.places.Autocomplete(currentInputRef.current, { fields: ['geometry', 'formatted_address'] });
				ac.addListener('place_changed', () => {
					const place = ac.getPlace();
					const addr = place?.formatted_address || currentInputRef.current!.value;
					setForm(prev => ({ ...prev, currentLocation: addr }));
				});
			}
			if (pickupInputRef.current) {
				const ac = new maps.places.Autocomplete(pickupInputRef.current, { fields: ['geometry', 'formatted_address'] });
				ac.addListener('place_changed', () => {
					const place = ac.getPlace();
					const addr = place?.formatted_address || pickupInputRef.current!.value;
					setForm(prev => ({ ...prev, pickupLocation: addr }));
				});
			}
			if (destinationInputRef.current) {
				const ac = new maps.places.Autocomplete(destinationInputRef.current, { fields: ['geometry', 'formatted_address'] });
				ac.addListener('place_changed', () => {
					const place = ac.getPlace();
					const addr = place?.formatted_address || destinationInputRef.current!.value;
					setForm(prev => ({ ...prev, destination: addr }));
				});
			}

			// Map click selection
			mapInstance.current?.addListener('click', (e: any) => {
				const latLng = e.latLng;
				if (!latLng || !mapInstance.current) return;
				selectedLatLngRef.current = latLng;
				if (selectionMarkerRef.current) selectionMarkerRef.current.setMap(null);
				selectionMarkerRef.current = new maps.Marker({
					position: latLng,
					map: mapInstance.current,
					title: 'Selected point'
				});
			});
		}).catch((err) => {
			console.error(err);
			alert('Failed to load Google Maps. Check API key.');
		});
	}, []);


	const reverseGeocode = async (coords: { lat: number; lng: number }): Promise<string> => {
		return new Promise((resolve) => {
			if (!geocoderRef.current) return resolve(`${coords.lat},${coords.lng}`);
			geocoderRef.current.geocode({ location: coords }, (results: any, status: any) => {
				if (status === 'OK' && results && results[0]) {
					resolve(results[0].formatted_address);
				} else {
					resolve(`${coords.lat},${coords.lng}`);
				}
			});
		});
	};

	const setCurrentFromGeolocation = async () => {
		if (!gmaps || !mapInstance.current) return;
		if (!navigator.geolocation) {
			alert('Geolocation is not supported by this browser.');
			return;
		}
		navigator.geolocation.getCurrentPosition(async (pos) => {
			const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
			const addr = await reverseGeocode(coords);
			setForm({ ...form, currentLocation: addr });
			mapInstance.current!.panTo(coords);
			mapInstance.current!.setZoom(14);
			if (currentMarkerRef.current) currentMarkerRef.current.setMap(null);
			currentMarkerRef.current = new gmaps.Marker({ position: coords, map: mapInstance.current!, title: 'Current location' });
		}, (err) => {
			console.error(err);
			alert('Failed to get current location. Ensure location permission is granted.');
		});
	};

	const setCurrentFromSelection = async () => {
		if (!gmaps || !mapInstance.current) return;
		const latLng = selectedLatLngRef.current;
		if (!latLng) {
			alert('Click on the map to select a point first.');
			return;
		}
		const coords = { lat: latLng.lat(), lng: latLng.lng() };
		const addr = await reverseGeocode(coords);
		setForm({ ...form, currentLocation: addr });
		if (currentMarkerRef.current) currentMarkerRef.current.setMap(null);
		currentMarkerRef.current = new gmaps.Marker({ position: coords, map: mapInstance.current!, title: 'Current location' });
	};

	const setPickupFromSelection = async () => {
		if (!gmaps || !mapInstance.current) return;
		const latLng = selectedLatLngRef.current;
		if (!latLng) {
			alert('Click on the map to select a point first.');
      return;
    }
		const coords = { lat: latLng.lat(), lng: latLng.lng() };
		const addr = await reverseGeocode(coords);
		setForm({ ...form, pickupLocation: addr });
		if (pickupMarkerRef.current) pickupMarkerRef.current.setMap(null);
		pickupMarkerRef.current = new gmaps.Marker({ position: coords, map: mapInstance.current!, title: 'Pickup Location' });
	};

	const setDestinationFromSelection = async () => {
		if (!gmaps || !mapInstance.current) return;
		const latLng = selectedLatLngRef.current;
		if (!latLng) {
			alert('Click on the map to select a point first.');
			return;
		}
		const coords = { lat: latLng.lat(), lng: latLng.lng() };
		const addr = await reverseGeocode(coords);
		setForm({ ...form, destination: addr });
		if (destinationMarkerRef.current) destinationMarkerRef.current.setMap(null);
		destinationMarkerRef.current = new gmaps.Marker({ position: coords, map: mapInstance.current!, title: 'Destination' });
	};

	const navigate = useNavigate();

	const handleRoute = async () => {
		if (!gmaps || !directionsService.current || !directionsRenderer.current) return;
		if (!form.currentLocation || !form.destination) {
			alert('Enter both current location and destination');
	      return;
	    }
		setIsCalculating(true);
		// Support LatLng input like "lat,lng" or address string
		const originValue: string | any = (() => {
			const parts = form.currentLocation.split(',').map(p => p.trim());
			if (parts.length === 2) {
				const lat = Number(parts[0]);
				const lng = Number(parts[1]);
				if (!Number.isNaN(lat) && !Number.isNaN(lng)) return { lat, lng };
			}
			return form.currentLocation;
		})();
		const routeRequest: any = {
			origin: originValue,
			destination: form.destination,
			travelMode: gmaps.TravelMode?.DRIVING || 'DRIVING',
		};
		if (form.pickupLocation && form.pickupLocation.trim().length > 0) {
			routeRequest.waypoints = [{ location: form.pickupLocation, stopover: true }];
			routeRequest.optimizeWaypoints = false;
		}
		let res;
		try {
			res = await directionsService.current.route(routeRequest);
			// Render primary route
			directionsRenderer.current.setDirections(res);
		} catch (err) {
			// Fallback: if waypoint caused ZERO_RESULTS, try routing in two legs
			if (form.pickupLocation && form.pickupLocation.trim().length > 0) {
				try {
					const leg1 = await directionsService.current.route({ origin: originValue, destination: form.pickupLocation, travelMode: gmaps.TravelMode?.DRIVING || 'DRIVING' });
					const leg2 = await directionsService.current.route({ origin: form.pickupLocation, destination: form.destination, travelMode: gmaps.TravelMode?.DRIVING || 'DRIVING' });
					// Render both legs
					directionsRenderer.current.setDirections(leg1);
					const dr2 = new gmaps.DirectionsRenderer({ map: mapInstance.current });
					dr2.setDirections(leg2);
					// Synthesize a combined response-like object
					res = { routes: [{ legs: [...(leg1.routes?.[0]?.legs || []), ...(leg2.routes?.[0]?.legs || [])] }] } as any;
				} catch (err2) {
					console.error('Fallback routing failed:', err2);
					alert('No drivable route found between points. Please adjust locations.');
					setIsCalculating(false);
					return;
				}
			} else {
				console.error('Routing failed:', err);
				alert('No drivable route found between the origin and destination.');
				setIsCalculating(false);
      return;
    }
		}

		const route = res.routes[0];
		const legs = route.legs || [];
		const firstLeg = legs[0];
		const lastLeg = legs[legs.length - 1] || firstLeg;
		const totalDurationSec = legs.reduce((sum: number, l: any) => sum + (l.duration?.value ?? 0), 0);
		const totalDistanceMeters = legs.reduce((sum: number, l: any) => sum + (l.distance?.value ?? 0), 0);
		const durationSec = totalDurationSec;
		const distanceMiles = Math.round(totalDistanceMeters * 0.000621371);
		const durationHours = Math.round(durationSec / 3600);
		const stops = Math.ceil(durationHours / 8); // Estimate stops based on 8-hour driving segments
		
		// Calculate arrival time
		const startDate = new Date(form.startDateISO);
		const arrivalDate = new Date(startDate.getTime() + durationSec * 1000);
		const arrivalStr = arrivalDate.toLocaleDateString('en-US', { 
			weekday: 'long', 
			month: 'short', 
			day: 'numeric',
			hour: 'numeric',
			hour12: true
		});

		// Prepopulate summary while server computes logs
		const newRouteData = { distance: distanceMiles, duration: durationHours, stops, arrival: arrivalStr };
		setRouteData(newRouteData);
		
		// Cache the route data and map route
		cacheManager.setAutoLogExportCache({ 
			routeData: newRouteData,
			mapRoute: {
				directions: res,
				rendered: true
			}
		});

		// Call backend to create trip and generate HOS segments
		const requestBody = {
			start_location: firstLeg?.start_address || form.currentLocation,
			pickup_location: form.pickupLocation || '',
			dropoff_location: lastLeg?.end_address || form.destination,
			current_cycle_hours: form.cycleHours,
			is_property_carrying: form.isPropertyCarrying,
			adverse_conditions: form.adverseConditions,
			fuel_interval_miles: form.fuelIntervalMiles,
			service_time_minutes: form.serviceTimeMinutes,
			start_date_iso: form.startDateISO,
			start_time_local: form.startTimeLocal,
			duration_seconds: durationSec,
			distance_meters: totalDistanceMeters
		};
		console.log('Sending request to backend:', requestBody);
		
		try {
			const resp = await fetch('http://localhost:8000/api/trips/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody)
			});
			if (!resp.ok) {
				const errorText = await resp.text();
				console.error('Backend error:', resp.status, errorText);
				throw new Error(`Failed to create trip: ${resp.status} ${errorText}`);
			}
			const data = await resp.json();
			console.log('Backend response:', data);
			console.log('Log entries from backend:', data.log_entries);
			console.log('Number of log entries:', data.log_entries?.length || 0);
			const summary = data?.calculated_route_json?.summary;
			const dailyProgress = data?.calculated_route_json?.daily_progress;
			console.log('Daily progress from backend:', dailyProgress);
			// Update UI summary
			const updatedRouteData = {
				distance: Number(String(summary?.distance || '').split(' ')[0]) || distanceMiles,
				duration: Number(String(summary?.duration || '').replace('h','')) || durationHours,
				stops: Number(summary?.stops ?? stops),
				arrival: summary?.arrival ? new Date(summary.arrival).toLocaleString() : arrivalStr
			};
			setRouteData(updatedRouteData);
			
			// Update cache with server response
			cacheManager.setAutoLogExportCache({ routeData: updatedRouteData });

			// Prepare overlay days from server log_entries; if none, fall back locally
			let daysToUse: Array<Array<{ startUtc: string; endUtc: string; status: LogEntry['status'] }>> = [];
			const serverEntries = Array.isArray(data.log_entries) ? data.log_entries : [];
			console.log('Processing server entries:', serverEntries.length);
			if (serverEntries.length > 0) {
				const byDate: Record<string, { startUtc: string; endUtc: string; status: LogEntry['status'] }[]> = {};
				for (const e of serverEntries) {
					const dateISO = e.log_sheet_date;
					const startUtc = `${dateISO}T${e.start_time}.000Z`;
					const endUtc = `${dateISO}T${e.end_time}.000Z`;
					const status = (e.duty_status === 'DR' ? 'D' : (e.duty_status as LogEntry['status']));
					console.log('Processing entry:', { dateISO, startUtc, endUtc, status });
					(byDate[dateISO] ||= []).push({ startUtc, endUtc, status });
				}
				console.log('Grouped by date:', byDate);
				daysToUse = Object.keys(byDate).sort().map(d => byDate[d]);
				console.log('Final daysToUse:', daysToUse);
			} else {
				// Fallback: generate at least day 1 entries so overlay never appears empty
				daysToUse = estimateDailySegments(durationSec);
			}

			const metaData = {
				origin: firstLeg?.start_address || form.currentLocation,
				destination: lastLeg?.end_address || form.destination,
				distanceMeters: totalDistanceMeters,
				durationSeconds: durationSec,
				cycle: form.cycle,
				cycleHours: form.cycleHours,
				startDateISO: form.startDateISO,
				isPropertyCarrying: form.isPropertyCarrying,
				adverseConditions: form.adverseConditions,
				fuelIntervalMiles: form.fuelIntervalMiles,
				serviceTimeMinutes: form.serviceTimeMinutes,
				tripId: data.id
			};
			console.log('Saving to localStorage:', { daysToUse, metaData, dailyProgress });
			localStorage.setItem('autoLogExport.days', JSON.stringify(daysToUse));
			localStorage.setItem('autoLogExport.meta', JSON.stringify(metaData));
			if (dailyProgress) {
				localStorage.setItem('autoLogExport.dailyProgress', JSON.stringify(dailyProgress));
			}
			localStorage.setItem('autoLogExport.ready', 'true');
			localStorage.setItem('autoLogExport.notice', serverEntries.length > 0 ? 'Auto log filled. You can now export the PDF.' : 'Auto log filled (fallback). You can now export the PDF.');
			alert('Auto log filling complete. Redirecting to PDF Overlay to export.');
			navigate('/overlay');
		} catch (err) {
			console.error('Backend error:', err);
			alert('Failed to generate logs on server. Using local estimate.');
			// Fallback to local stub
			const fallbackRouteData = { distance: distanceMiles, duration: durationHours, stops, arrival: arrivalStr };
			setRouteData(fallbackRouteData);
			
			// Cache fallback route data
			cacheManager.setAutoLogExportCache({ routeData: fallbackRouteData });
			const days = estimateDailySegments(durationSec);
			const fallbackMeta = {
				origin: firstLeg?.start_address || form.currentLocation,
				destination: lastLeg?.end_address || form.destination,
				distanceMeters: totalDistanceMeters,
				durationSeconds: durationSec,
				cycle: form.cycle,
				cycleHours: form.cycleHours,
				startDateISO: form.startDateISO,
				isPropertyCarrying: form.isPropertyCarrying,
				adverseConditions: form.adverseConditions,
				fuelIntervalMiles: form.fuelIntervalMiles,
				serviceTimeMinutes: form.serviceTimeMinutes
			};
			console.log('Fallback - Saving to localStorage:', { days, fallbackMeta });
			localStorage.setItem('autoLogExport.days', JSON.stringify(days));
			localStorage.setItem('autoLogExport.meta', JSON.stringify(fallbackMeta));
			localStorage.setItem('autoLogExport.ready', 'true');
			localStorage.setItem('autoLogExport.notice', 'Auto log filled (local estimate). You can now export the PDF.');
			alert('Auto log filling complete (local estimate). Redirecting to PDF Overlay.');
			navigate('/overlay');
		}
		setIsCalculating(false);
  };

  // Intention: Three-column grid (inputs | spacer | map) with scroll constrained to input column only
  return (
	<div
		className="fixed inset-x-0 bg-gray-200 overflow-hidden flex flex-col"
		style={{ top: 'var(--nav-height, 64px)', bottom: 0 }}
	>
			{/* Main Content Area */}
			<div className="flex-1 min-h-0 grid h-full grid-cols-1 lg:grid-cols-12 gap-4">

			{/* Input Section - scrolls independently */}
			<div className="bg-gradient-to-br from-gray-50 to-gray-100 p-6 overflow-y-auto h-full min-h-0 lg:col-span-4">
				{/* Header */}
				<div className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 px-6 py-4 relative overflow-hidden mb-6">
					{/* Decorative background pattern */}
					<div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-transparent"></div>
					<div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-16 translate-x-16"></div>
					<div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-12 -translate-x-12"></div>
					
					<div className="relative flex items-center justify-between">
						<div className="flex items-center space-x-3">
							<div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
								<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
								</svg>
							</div>
							<div>
								<h2 className="text-2xl font-bold text-white drop-shadow-sm">Trip Details</h2>
								<p className="text-blue-100 text-sm">Plan your route and generate log sheets</p>
							</div>
						</div>
						
						{/* Debug buttons */}
						<div className="flex space-x-2">
							<button
								onClick={() => cacheManager.logCacheStatus()}
								className="px-3 py-1 bg-white/20 text-white text-xs rounded hover:bg-white/30 transition-colors hidden"
								title="Log Cache Status"
							>
								Debug
							</button>
							<button
								onClick={() => cacheManager.clearCacheForTesting()}
								className="px-3 py-1 bg-red-500/20 text-white text-xs rounded hover:bg-red-500/30 transition-colors hidden"
								title="Clear Cache"
							>
								Clear
							</button>
						</div>
					</div>
				</div>

				{/* Form Content */}
				<div className="space-y-4">
						{/* Current Location */}
						<div className="space-y-2">
							<label className="block text-xs font-bold text-gray-800 uppercase tracking-wide">Current Location</label>
							<div className="flex gap-2">
								<input 
									ref={currentInputRef} 
									value={form.currentLocation} 
									onChange={(e)=>setForm({...form, currentLocation: e.target.value})} 
									className="flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white shadow-md hover:shadow-lg transition-all duration-200 text-sm text-gray-700 placeholder-gray-400" 
									placeholder="Enter starting location" 
								/>
								<button
									onClick={setCurrentFromGeolocation}
									type="button"
									className="px-3 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg transition-all duration-200 border-2 border-blue-500 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
									title="Use My Location"
									>
									<svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
										<path d="M10 2a6 6 0 00-6 6c0 4.418 6 10 6 10s6-5.582 6-10a6 6 0 00-6-6zm0 8a2 2 0 110-4 2 2 0 010 4z"/>
									</svg>
								</button>

								<button
									onClick={setCurrentFromSelection}
									type="button"
									className="px-3 py-2.5 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg transition-all duration-200 border-2 border-green-500 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
									title="Use Selected Point"
									>
									<svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
										<path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414L8.414 15l-4.121-4.121a1 1 0 111.414-1.414L8.414 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
									</svg>
								</button>
							</div>
						</div>

						{/* Pickup Location */}
						<div className="space-y-2">
							<label className="block text-xs font-bold text-gray-800 uppercase tracking-wide">Pickup Location</label>
							<div className="flex gap-2">
								<input 
									ref={pickupInputRef}
									value={form.pickupLocation}
									onChange={(e)=>setForm({...form, pickupLocation: e.target.value})}
									className="flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white shadow-md hover:shadow-lg transition-all duration-200 text-sm text-gray-700 placeholder-gray-400" 
									placeholder="Enter pickup location" 
								/>
								<button
									onClick={setPickupFromSelection}
									type="button"
									className="px-3 py-2.5 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg transition-all duration-200 border-2 border-green-500 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
									title="Use Selected Point"
									>
									<svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
										<path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414L8.414 15l-4.121-4.121a1 1 0 111.414-1.414L8.414 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
									</svg>
								</button>
							</div>
						</div>

						{/* Drop-off Location */}
						<div className="space-y-2">
							<label className="block text-xs font-bold text-gray-800 uppercase tracking-wide">Drop-off Location</label>
							<div className="flex gap-2">
								<input 
									ref={destinationInputRef} 
									value={form.destination} 
									onChange={(e)=>setForm({...form, destination: e.target.value})} 
									className="flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white shadow-md hover:shadow-lg transition-all duration-200 text-sm text-gray-700 placeholder-gray-400" 
									placeholder="Enter final destination" 
								/>
								<button
									onClick={setDestinationFromSelection}
									type="button"
									className="px-3 py-2.5 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg transition-all duration-200 border-2 border-green-500 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
									title="Use Selected Point"
									>
									<svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
										<path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414L8.414 15l-4.121-4.121a1 1 0 111.414-1.414L8.414 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
									</svg>
								</button>
							</div>
						</div>

						{/* Cycle Hours */}
						<div className="space-y-2">
							<div className="flex items-center space-x-2">
								<label className="block text-xs font-bold text-gray-800 uppercase tracking-wide">Current Cycle Hours</label>
								<div className="relative group">
									<svg className="w-4 h-4 text-blue-500 cursor-help hover:text-blue-600 transition-colors" fill="currentColor" viewBox="0 0 20 20">
										<path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
									</svg>
									<div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-nowrap pointer-events-none shadow-lg">
										Enter total on-duty hours in the last 7 days
									</div>
								</div>
							</div>
							<input 
								type="number"
								value={form.cycleHours}
								onChange={(e)=>setForm({...form, cycleHours: Number(e.target.value)})}
								className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white shadow-md hover:shadow-lg transition-all duration-200 text-sm text-gray-700 placeholder-gray-400" 
								placeholder="0"
								min="0"
								max="70"
							/>
						</div>

						{/* Cycle Type and Start Date */}
				<div className="grid grid-cols-3 gap-3">
							<div className="space-y-2">
								<label className="block text-xs font-bold text-gray-800 uppercase tracking-wide">Cycle Type</label>
								<select 
									value={form.cycle} 
									onChange={(e)=>setForm({...form, cycle: e.target.value as PlannerForm['cycle']})} 
									className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white shadow-md hover:shadow-lg transition-all duration-200 text-sm text-gray-700"
								>
									<option value="60/7">60/7 Hours</option>
									<option value="70/8">70/8 Hours</option>
								</select>
							</div>

							<div className="space-y-2">
								<label className="block text-xs font-bold text-gray-800 uppercase tracking-wide">Start Date</label>
								<input 
									type="date" 
									value={form.startDateISO} 
									onChange={(e)=>setForm({...form, startDateISO: e.target.value})} 
									className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white shadow-md hover:shadow-lg transition-all duration-200 text-sm text-gray-700" 
								/>
							</div>

					<div className="space-y-2">
						<label className="block text-xs font-bold text-gray-800 uppercase tracking-wide">Start Time</label>
						<input
							type="time"
							value={form.startTimeLocal}
							onChange={(e)=>setForm({...form, startTimeLocal: e.target.value})}
							className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white shadow-md hover:shadow-lg transition-all duration-200 text-sm text-gray-700"
						/>
					</div>
						</div>

				{/* Assumptions (collapsible) */}
				<div className="pt-4 border-t border-gray-200">
					<details className="group">
						<summary className="cursor-pointer select-none flex items-center justify-between px-2 py-2 rounded-md bg-white border border-gray-200 hover:bg-gray-50 text-sm font-semibold text-gray-800">
							<span>Assumptions</span>
							<span className="text-gray-500 transition-transform duration-200 group-open:rotate-180" aria-hidden="true">
								<svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
									<path fillRule="evenodd" clipRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.25 8.29a.75.75 0 01-.02-1.08z" />
								</svg>
							</span>
						</summary>
						<div className="mt-3 grid grid-cols-2 gap-3">
							<label className="flex items-center gap-2 text-sm text-gray-700">
								<input
									type="checkbox"
									checked={form.isPropertyCarrying}
									onChange={(e)=>setForm({...form, isPropertyCarrying: e.target.checked})}
									className="h-4 w-4"
								/>
								<span>Property-carrying driver</span>
							</label>
							<label className="flex items-center gap-2 text-sm text-gray-700">
								<input
									type="checkbox"
									checked={form.adverseConditions}
									onChange={(e)=>setForm({...form, adverseConditions: e.target.checked})}
									className="h-4 w-4"
								/>
								<span>No adverse driving conditions</span>
							</label>
							<div className="space-y-1">
								<label className="block text-xs font-bold text-gray-800 uppercase tracking-wide">Fuel Interval (miles)</label>
								<input
									type="number"
									min={100}
									step={50}
									value={form.fuelIntervalMiles}
									onChange={(e)=>setForm({...form, fuelIntervalMiles: Number(e.target.value)})}
									className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white shadow-md hover:shadow-lg transition-all duration-200 text-sm text-gray-700"
								/>
							</div>
							<div className="space-y-1">
								<label className="block text-xs font-bold text-gray-800 uppercase tracking-wide">Pickup/Drop-off Time (mins)</label>
								<input
									type="number"
									min={0}
									step={5}
									value={form.serviceTimeMinutes}
									onChange={(e)=>setForm({...form, serviceTimeMinutes: Number(e.target.value)})}
									className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white shadow-md hover:shadow-lg transition-all duration-200 text-sm text-gray-700"
								/>
							</div>
						</div>
					</details>
				</div>

						{/* Calculate Button */}
						<div className="pt-3">
							<button
								onClick={handleRoute}
								disabled={isCalculating || !form.currentLocation || !form.destination}
								className="w-full bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 hover:from-blue-700 hover:via-blue-800 hover:to-blue-900 disabled:from-gray-400 disabled:via-gray-500 disabled:to-gray-600 text-white py-3 px-6 rounded-xl font-bold text-base shadow-lg hover:shadow-xl transition-all duration-300 disabled:cursor-not-allowed transform hover:-translate-y-0.5 disabled:transform-none relative overflow-hidden"
							>
								{/* Button background effect */}
								<div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300"></div>
								
								{isCalculating ? (
									<div className="flex items-center justify-center space-x-2 relative z-10">
										<div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
										<span className="text-base">Calculating Route...</span>
									</div>
								) : (
									<div className="flex items-center justify-center space-x-2 relative z-10">
										<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
										</svg>
										<span className="text-base">Calculate Route & Logs</span>
									</div>
								)}
							</button>
						</div>
				</div>

          </div>

				{/* Map Section */}
				<div className="bg-indigo-900 rounded-lg relative h-[40vh] md:h-[50vh] lg:h-full min-h-[300px] lg:col-span-8">
					<div ref={mapRef} className="w-full h-full rounded-lg" />
          </div>
          </div>

			{/* Bottom Section removed to prevent page scroll */}

			{/* Route Information Display - Overlay on map */}
			{routeData && showRouteInfo && (
				<div className="absolute bottom-20 left-4 right-4 bg-white border border-gray-200 rounded-lg p-4 shadow-lg">
					<div className="flex items-center justify-between mb-3">
						<h3 className="text-lg font-semibold text-gray-800">Route Information</h3>
          <div className="flex items-center gap-2">
							<div className="text-sm text-gray-500">Generated on {new Date().toLocaleDateString()}</div>
							<button
								onClick={() => setShowRouteInfo(false)}
								className="text-gray-400 hover:text-gray-600 transition-colors"
								title="Close"
							>
								<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						</div>
					</div>
					<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
						<div className="text-center p-3 bg-blue-50 rounded-lg">
							<div className="text-2xl font-bold text-blue-600">{routeData.distance}</div>
							<div className="text-sm text-gray-600">Total Miles</div>
						</div>
						<div className="text-center p-3 bg-green-50 rounded-lg">
							<div className="text-2xl font-bold text-green-600">{routeData.duration}</div>
							<div className="text-sm text-gray-600">Driving Hours</div>
						</div>
						<div className="text-center p-3 bg-orange-50 rounded-lg">
							<div className="text-2xl font-bold text-orange-600">{routeData.stops}</div>
							<div className="text-sm text-gray-600">Required Stops</div>
						</div>
						<div className="text-center p-3 bg-purple-50 rounded-lg">
							<div className="text-lg font-bold text-purple-600">{routeData.arrival}</div>
							<div className="text-sm text-gray-600">Arrival Time</div>
						</div>
					</div>
					
					{/* Tab Navigation */}
					<div className="flex space-x-4 mt-4 pt-4 border-t border-gray-200">
						<button
							onClick={() => setActiveTab('summary')}
							className={`px-4 py-2 rounded-md font-medium transition-colors border ${
								activeTab === 'summary'
									? 'bg-blue-600 text-white border-blue-600'
									: 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
							}`}
						>
							Route Summary
						</button>
						<button
							onClick={() => setActiveTab('logs')}
							className={`px-4 py-2 rounded-md font-medium transition-colors border ${
								activeTab === 'logs'
									? 'bg-blue-600 text-white border-blue-600'
									: 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
							}`}
						>
							Driver Logs
						</button>
          </div>
            </div>
          )}


			{/* Logs Content Overlay */}
			{routeData && activeTab === 'logs' && (
				<div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 bg-white rounded-lg shadow-lg p-6 max-w-4xl w-full mx-4">
					<div className="bg-blue-50 border border-blue-200 rounded-md p-4">
						<div className="flex items-center">
							<div className="flex-shrink-0">
								<svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
									<path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
								</svg>
							</div>
							<div className="ml-3">
								<p className="text-sm text-blue-700">
									Route planned successfully! Go to the <strong>PDF Overlay</strong> page to view and export your log sheets.
								</p>
        </div>
        </div>
      </div>
				</div>
			)}
    </div>
  );
};






