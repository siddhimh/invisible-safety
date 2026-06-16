export function hasValidPoint(feature) {
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords)) return false;
  const [lng, lat] = coords;
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    Math.abs(lng) <= 180 &&
    Math.abs(lat) <= 90
  );
}