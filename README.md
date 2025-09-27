# Spotter Log Sheet – Django + React (Vite)

A full-stack app that plans a trip, computes HOS-style daily segments, and renders/exports PDF log sheets.

- Frontend: React (Vite) – map planning UI, Google Maps integration, and PDF overlay/export.
- Backend: Django + DRF – trip creation endpoint, Google APIs lookups, simplified HOS segmentation.

The flow:
1) In the frontend, use the Trip Planner to enter Current, Pickup, and Drop-off locations plus assumptions.
2) The app will route the trip with Google Maps, compute a summary, and call the Django API to generate log entries.
3) The PDF Overlay page draws the daily log sheet(s) on top of a template and lets you export a final multi-page PDF.


## Repository Structure

- `logsheet/` – React app (Vite)
  - `src/components/AutoLogExport.tsx` – trip planning UI and API call to backend
  - `src/components/PdfOverlayPage.tsx` – renders overlays on a PDF template, multi-page export
  - `src/components/PdfCoordinateMapper.tsx` – tool to map coordinates for the PDF template
  - `src/utils/googleMaps.ts` – Google Maps JS API loader (reads `VITE_GOOGLE_MAPS_API_KEY`)
- `backend/` – Django project (settings, URLs)
- `driver_log/` – Django app
  - `views.py` – `TripViewSet.create` implements trip logic and calls Google APIs
- `docs/` – documentation artifacts
  - `env.example` – example environment variables for both frontend and backend


## Prerequisites

- Node.js 18+
- Python 3.11+
- A Google Cloud project with billing enabled
- A Google Maps API Key with the following APIs enabled:
  - Maps JavaScript API
  - Places API
  - Geocoding API
  - Directions API
  - Distance Matrix API


## Environment Variables

This project uses two environments:

- Frontend (Vite): Reads `VITE_GOOGLE_MAPS_API_KEY` to load the Maps JavaScript API.
- Backend (Django): Reads `GOOGLE_MAPS_API_KEY` to call HTTP endpoints (Distance Matrix, Directions, Geocoding).

Create your local `.env` at the repository root (NOT committed). You can start from `docs/env.example`:

```bash
# From project root
copy docs\env.example .env   # Windows
# or
cp docs/env.example .env      # macOS/Linux
```

Then edit `.env` and set your keys.

Important code references:
- Frontend loader: `logsheet/src/utils/googleMaps.ts`
  - Reads `import.meta.env.VITE_GOOGLE_MAPS_API_KEY`.
- Backend usage: `driver_log/views.py`
  - Calls `os.getenv('GOOGLE_MAPS_API_KEY')` (loaded via `python-dotenv` in `manage.py`).
  - We removed the hardcoded API key line and rely purely on env.


## Setting up Google Maps API Key

1) In Google Cloud Console, create an API key.
2) Enable these APIs on that key: Maps JavaScript API, Places API, Geocoding API, Directions API, Distance Matrix API.
3) Add HTTP referrer restrictions for the frontend key if desired.
4) Add IP or no restrictions for the backend key, or restrict appropriately for your hosting.

Populate `.env`:

```
# Frontend (Vite)
VITE_GOOGLE_MAPS_API_KEY=YOUR_FRONTEND_MAPS_JS_API_KEY

# Backend (Django)
GOOGLE_MAPS_API_KEY=YOUR_BACKEND_SERVER_API_KEY
```


## Install & Run

### Backend (Django)

Create a virtual environment, install dependencies, and run the server:

```bash
# From project root
python -m venv .venv
. .venv/Scripts/activate   # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Migrate and run
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

Django will load `.env` automatically via `python-dotenv` (see `manage.py`).

### Frontend (Vite React)

```bash
# From project root
cd logsheet
npm install
npm run dev
```

The frontend expects `VITE_GOOGLE_MAPS_API_KEY` in your `.env` at the repository root. Vite will expose it to `import.meta.env`.


## Security Notes

- Do NOT commit real API keys. Use `.env` locally and secrets in your CI/CD.
- We previously had a hardcoded Google Maps API key at `driver_log/views.py:L295-L296`. This has been removed in the repository. Ensure your `.env` contains `GOOGLE_MAPS_API_KEY`.
- Restrict API keys in Google Cloud (HTTP referrers for frontend, IPs or service accounts for backend) whenever possible.


## PDF Template

- Backend and frontend expect `log_sheet.pdf` to be accessible by the frontend app. Place your template in the public assets (e.g., `logsheet/public/log_sheet.pdf`) and the worker at `logsheet/public/pdf.worker.min.js`.


## Development Tips

- `AutoLogExport.tsx` caches form and route snippets so your flow is resumable.
- `PdfCoordinateMapper.tsx` helps you map coordinates once and export `coordinates.ts/json`.
- `PdfOverlayPage.tsx` draws overlays and exports multi-page PDF.


## API Overview (Backend)

- `POST /api/trips/` – Creates a trip, computes segments, and returns data used by the frontend overlay.
  - Body fields include: `start_location`, `pickup_location`, `dropoff_location`, `current_cycle_hours`, `service_time_minutes`, `duration_seconds`, `distance_meters`, etc.


## Troubleshooting

- Missing Maps JS key in frontend:
  - Error: `VITE_GOOGLE_MAPS_API_KEY is missing` -> set the key in `.env` and restart dev server.
- Backend Google API calls not returning expected data:
  - Confirm `GOOGLE_MAPS_API_KEY` is set and the APIs are enabled.
  - Check console logs in Django runserver for details.


## License

MIT (or your preferred license)