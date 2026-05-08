# Invisible Safety

A spatial data visualization system for exploring surface-level safety and subsurface infrastructure risk in New York City. The project combines public urban datasets such as 311 complaints, crime incidents, motor vehicle collisions, CSO outfalls, sewer interceptors, sewersheds, and 3D building context into an interactive Mapbox + Deck.gl dashboard.


## Project Overview

Invisible Safety visualizes compound urban risk by combining visible street-level safety indicators with hidden infrastructure-related signals. Instead of showing each dataset as an isolated map layer, the system organizes the data into four coordinated analysis modes:

1. Urban Risk Index
2. Pipe Proximity
3. Surface Risk
4. Infrastructure View

Each mode changes the visible layers, visual encodings, and interaction behavior to support a different analytical question.

## Features

- Interactive Mapbox-based 3D city map
- GPU-accelerated geospatial rendering with Deck.gl
- Urban Risk Index using weighted composite risk scoring
- Adjustable risk weights for crime, crashes, 311 complaints, and CSO proximity
- Pipe proximity analysis using 200m sewer corridor buffers
- Surface risk hotspots from crime, crashes, and 311 reports
- Infrastructure view for sewer interceptors, CSO outfalls, and sewersheds
- Mode-aware visual encodings
- Year range filtering
- Address search using Mapbox Geocoding API
- Click-to-inspect feature details
- 3D building context using Mapbox building layers

## Live Demo

Add your deployed link here:

```text
https://siddhimh.github.io/invisible-safety/
```

## Tech Stack

- React — frontend UI and state management
- Vite — development server and production build tooling
- Mapbox GL / react-map-gl — basemap and camera controls
- Deck.gl — geospatial layers and GPU rendering
- Turf.js — spatial analysis, buffers, grids, and point-in-polygon classification
- Mapbox Geocoding API — address search
- Python / pandas / GeoPandas — data cleaning and preprocessing

## Data Sources

The project uses publicly available urban datasets.

| Dataset | Source | Role |
|---|---|---|
| 311 Infrastructure Complaints | NYC OpenData | Public-reported infrastructure issues |
| Motor Vehicle Collisions | NYC OpenData | Surface-level traffic safety |
| NYPD Crime Complaints | NYC OpenData | Surface-level safety risk |
| Sewer Interceptors | Open Sewer Atlas | Approximate trunk sewer network |
| CSO Outfalls | Open Sewer Atlas | Combined sewer overflow infrastructure |
| Sewersheds / Sewer Zones | Open Sewer Atlas | Drainage and sewer context |
| Buildings | Mapbox / NYC spatial data | 3D urban context |


## Getting Started

### Prerequisites

Install the following:

- Node.js version 18 or higher
- npm
- A Mapbox access token

Check your versions:

```bash
node -v
npm -v
```

## Installation

Clone the repository:

```bash
git clone <repo-url>
cd invisible-safety
```

Install dependencies:

```bash
npm install
```

## Environment Variables

Create a `.env` file in the project root:

```env
VITE_MAPBOX_TOKEN=your_mapbox_token_here
```

The variable name must start with `VITE_` because this is a Vite project.

After creating or editing `.env`, restart the development server.

## Running Locally

Start the development server:

```bash
npm run dev
```

Open the local URL shown in the terminal. It is usually:

```text
http://localhost:5173
```

## Production Build

Create an optimized production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```


## How to Use the Application

1. Open the dashboard.
2. Use the analysis mode selector to switch between:
   - Urban Risk Index
   - Pipe Proximity
   - Surface Risk
   - Infrastructure View
3. Adjust the year range to filter temporal datasets.
4. Use the Urban Risk sliders to change the weight of each risk factor.
5. Search for an address or location using the search box.
6. Click map features to inspect risk breakdowns or infrastructure details.
7. Use the layer panel to toggle supporting layers.

## Analysis Modes

### Urban Risk Index

Shows a composite risk surface generated from crime, collisions, 311 complaints, and CSO proximity. Users can adjust the weight of each factor and click grid cells to view a breakdown.

### Pipe Proximity

Shows sewer interceptor corridors and compares 311 complaints inside and outside a 200m infrastructure buffer.

### Surface Risk

Shows visible street-level risk using crime density, crashes, and 311 activity.

### Infrastructure View

Shows sewer interceptors, CSO outfalls, sewersheds, and 3D building context to reveal hidden infrastructure systems.

## Data Notes

This project uses public and approximate datasets. Open Sewer Atlas data is educational and should not be treated as official NYC DEP pipe geometry. 311 complaints are public-reported incidents and should be interpreted as proxy signals rather than confirmed infrastructure failures.

The system is intended for visualization, analysis, and public communication, not for engineering, excavation, or operational utility work.

## Troubleshooting

### Map does not load

Check that your `.env` file contains a valid Mapbox token:

```env
VITE_MAPBOX_TOKEN=your_mapbox_token_here
```

Then restart the server:

```bash
npm run dev
```

## Credits

Created by Siddhi Mhatre for the NYU Information Visualization course, Spring 2026.

Data sources include NYC OpenData, Open Sewer Atlas, and Mapbox.