/* Geofence — Haversine distance + in-range check.
 *
 * All geofence math runs on the SERVER. The client only ever sends
 * raw lat/lng; the server decides whether a check-in is inside the
 * configured office radius. Haversine gives great-circle distance in
 * metres, accurate to ~0.5% over city-scale distances.
 */
'use strict';

/** Earth's mean radius in metres. */
const EARTH_RADIUS_M = 6371000;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two lat/lng points, in metres. */
function haversineMeters(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/** Check whether a point is within the office radius. */
function checkGeofence(lat, lng, settings) {
  if (!settings || settings.officeLat == null || settings.officeLng == null) {
    return { inRange: true, distanceMeters: 0 }; // no office configured → allow
  }
  const distance = haversineMeters(
    lat,
    lng,
    Number(settings.officeLat),
    Number(settings.officeLng),
  );
  const radius = Number(settings.radiusMeters || 0);
  return { inRange: distance <= radius, distanceMeters: Math.round(distance) };
}

module.exports = { haversineMeters, checkGeofence, EARTH_RADIUS_M };
