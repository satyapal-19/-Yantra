/**
 * geoObfuscator.js
 * Applies a uniform random 50-meter offset to GPS coordinates.
 * This protects the reporter's identity by preventing pinpointing
 * to a specific flat/building.
 *
 * IMPORTANT: Raw lat/lng must NEVER be stored. Always obfuscate
 * on the server side before any database write.
 *
 * Uses uniform disk sampling (sqrt of random) to avoid clustering
 * of points near the center of the disk.
 */

const EARTH_RADIUS_METERS = 6378137;

/**
 * @param {number} lat - Exact latitude from GPS
 * @param {number} lng - Exact longitude from GPS
 * @param {number} radiusMeters - Max obfuscation radius (default: 50m)
 * @returns {{ latitude: number, longitude: number }}
 */
export function obfuscateCoordinates(lat, lng, radiusMeters = 50) {
  // Uniform random distance within the circle (sqrt prevents center clustering)
  const r = radiusMeters * Math.sqrt(Math.random());
  const theta = Math.random() * 2 * Math.PI;

  // Convert polar offset to Cartesian meters
  const dx = r * Math.cos(theta); // East-West offset in meters
  const dy = r * Math.sin(theta); // North-South offset in meters

  // Convert meter offsets to degree offsets
  const dLat = (dy / EARTH_RADIUS_METERS) * (180 / Math.PI);
  const dLng =
    (dx / (EARTH_RADIUS_METERS * Math.cos((lat * Math.PI) / 180))) *
    (180 / Math.PI);

  return {
    latitude: parseFloat((lat + dLat).toFixed(6)),
    longitude: parseFloat((lng + dLng).toFixed(6)),
  };
}
