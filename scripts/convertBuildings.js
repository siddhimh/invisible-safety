import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(here, '../data/processed/boroughs.csv')
const DST = resolve(here, '../public/data/buildings.geojson')

const text = readFileSync(SRC, 'utf8').trim()
const [headerLine, ...rows] = text.split(/\r?\n/)
const headers = headerLine.split(',')

const idx = (name) => headers.indexOf(name)
const iLat = idx('latitude')
const iLon = idx('longitude')
const iFloors = idx('numfloors')
const iYear = idx('yearbuilt')
const iBldgArea = idx('bldgarea')
const iLandUse = idx('landuse')
const iClass = idx('bldgclass')
const iAddr = idx('address')
const iBoro = idx('borough')

const num = (v) => {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const features = []
for (const row of rows) {
  const cols = row.split(',')
  const lat = num(cols[iLat])
  const lon = num(cols[iLon])
  if (lat == null || lon == null) continue
  features.push({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {
      borough: cols[iBoro],
      yearbuilt: num(cols[iYear]),
      numfloors: num(cols[iFloors]) ?? 1,
      bldgarea: num(cols[iBldgArea]),
      landuse: num(cols[iLandUse]),
      bldgclass: cols[iClass],
      address: cols[iAddr],
    },
  })
}

writeFileSync(
  DST,
  JSON.stringify({ type: 'FeatureCollection', features }),
)
console.log(`Wrote ${features.length} buildings to ${DST}`)
