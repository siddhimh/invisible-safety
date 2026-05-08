const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

const INITIAL_VIEW_STATE = {
  longitude: -73.98,
  latitude: 40.75,
  zoom: 11,
  pitch: 45,
  bearing: 0,
}
const STREET_VIEW_VIEW_STATE = {
  longitude: -73.9876,
  latitude: 40.7411,
  zoom: 17.2,
  pitch: 78,
  bearing: -18,
}

const MAP_STYLE = 'mapbox://styles/mapbox/dark-v11'

const BUILDINGS_3D_LAYER = {
  id: '3d-buildings',
  source: 'composite',
  'source-layer': 'building',
  filter: ['==', 'extrude', 'true'],
  type: 'fill-extrusion',
  minzoom: 14,
  paint: {
    'fill-extrusion-color': '#334155',
    'fill-extrusion-height': ['get', 'height'],
    'fill-extrusion-base': ['get', 'min_height'],
    'fill-extrusion-opacity': 0.35,
  },
}

const BUILDINGS_OPACITY_BY_MODE = {
  'pipe-proximity': 0.16,
  'street-view': 0.78,
}

const LAYER_META = [
  { id: 'cso-locations',           label: 'CSO outfalls',                                                       swatch: '#1d9e75',
    swatchByMode: { infrastructure: 'radial-gradient(circle,#2dd4bf 35%,rgba(45,212,191,0.15) 75%)' } },
  { id: '311-complaints',          label: '311 complaints',     note: 'sewer · water · street',                 swatch: 'linear-gradient(90deg,#ef4444,#3b82f6,#f59e0b)',
    swatchByMode: { 'pipe-proximity': 'linear-gradient(90deg,#d46e6e,#789cd2,#d8a864)' } },
  { id: 'collisions',              label: 'Crashes',            note: 'larger dot = fatal',                     swatch: '#ec4899' },
  { id: 'crime-heat',              label: 'Crime density',      note: 'yellow → dark red by count',             swatch: 'linear-gradient(90deg,#ffffb2,#feb24c,#fd8d3c,#f03b20,#bd0026)' },
  { id: 'urban-risk',              label: 'Urban Risk Index',   note: 'derived choropleth — adjust weights',    swatch: 'linear-gradient(90deg,#ffffcc,#fed976,#feb24c,#fd8d3c,#bd0026)' },
  { id: 'surface-hotspots',        label: 'Surface hotspots',   note: 'top streets where signals stack up',     swatch: 'radial-gradient(circle,rgba(255,255,255,0.4) 0%,rgba(255,255,255,0.2) 60%,#0f172a 62%,#0f172a 70%,transparent 72%)' },
  { id: 'pipe-proximity',          label: 'Pipe corridor',      note: '200 m buffer · soft teal glow',          swatch: 'radial-gradient(ellipse,rgba(20,184,166,0.5) 0%,rgba(20,184,166,0.18) 70%,transparent 100%)' },
  { id: '3d-buildings',            label: 'Buildings',          note: 'real footprints, zoom ≥ 14',             swatch: '#4a5568' },
  { id: 'interceptors',            label: 'Sewer trunk lines',                                                  swatch: '#00e676',
    swatchByMode: { infrastructure: '#22d3ee', 'pipe-proximity': '#7dd3c4' } },
  { id: 'sewersheds',              label: 'Sewersheds',                                                         swatch: 'rgba(255,255,255,0.4)',
    swatchByMode: { infrastructure: 'rgba(94,234,212,0.45)' } },
  { id: 'combined-separate-sewer', label: 'Sewer system',       note: 'purple = combined · blue = separate',    swatch: 'linear-gradient(90deg,#a855f7,#3b82f6)' },
]

const ANALYSIS_MODES = [
  {
    id: 'urban-risk',
    label: 'Urban Risk Index',
    layers: new Set([
      'urban-risk',
      'cso-locations',
      'sewersheds',
      'combined-separate-sewer',
      '3d-buildings',
    ]),
  },
  {
    id: 'pipe-proximity',
    label: 'Pipe Proximity',

    layers: new Set([
      'pipe-proximity',
      'interceptors',
      'cso-locations',
      '311-complaints',
      '3d-buildings',
    ]),
  },
  {
    id: 'surface-risk',
    label: 'Surface Risk',
    layers: new Set([
      'crime-heat',
      'collisions',
      '311-complaints',
      'surface-hotspots',
      '3d-buildings',
    ]),
  },
  {
    id: 'infrastructure',
    label: 'Infrastructure View',
    layers: new Set([
      'interceptors',
      'cso-locations',
      'sewersheds',
      '3d-buildings',
    ]),
  },
  {
    id: 'street-view',
    label: 'Street View',
    layers: new Set([
      'urban-risk',
      'interceptors',
      'cso-locations',
      '311-complaints',
      'collisions',
      'surface-hotspots',
      '3d-buildings',
    ]),
  },
]

const DEFAULT_MODE_ID = 'urban-risk'

const PROXIMITY_BUFFER_M = 200
const ZOOM_BY_LAYER = {
  'urban-risk': 14,
  'surface-hotspots': 15,
  collisions: 17,
  '311-complaints': 17,
  'cso-locations': 16,
  interceptors: 14,
  sewersheds: 12,
  'combined-separate-sewer': 12,
}
const ZOOM_BY_LAYER_BY_MODE = {
  'pipe-proximity': {
    interceptors: 15.5,
  },
}

const DATASETS = [
  { key: 'complaints', label: '311 reports',  url: 'data/311_infrastructure.geojson' },
  { key: 'cso',        label: 'CSO outfalls', url: 'data/cso_locations.geojson' },
  { key: 'collisions', label: 'Crashes',      url: 'data/collisions.geojson' },
  { key: 'crime',      label: 'Crime',        url: 'data/crime.geojson' },
]

const CONFIG = {DEFAULT_MODE_ID, 
  ANALYSIS_MODES, 
  LAYER_META, 
  BUILDINGS_OPACITY_BY_MODE, 
  BUILDINGS_3D_LAYER, 
  MAPBOX_TOKEN,
  INITIAL_VIEW_STATE,
  STREET_VIEW_VIEW_STATE,
  MAP_STYLE, PROXIMITY_BUFFER_M, ZOOM_BY_LAYER, ZOOM_BY_LAYER_BY_MODE, DATASETS}

export default CONFIG;