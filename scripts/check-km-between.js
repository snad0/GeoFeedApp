// Quick smoke-check for the kmBetween haversine helper
function kmBetween(a, b) {
  if (!a || !b) return Infinity;
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function approxEqual(a, b, tol = 0.5) {
  return Math.abs(a - b) <= tol;
}

(function run() {
  try {
    // 1 degree longitude at equator (0,0) -> (0,1) ~ 111.195 km
    const d = kmBetween({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 });
    console.log('Distance 0° lat, 0°→1° lon:', d.toFixed(3), 'km');
    if (!approxEqual(d, 111.195, 0.6)) throw new Error('Unexpected distance for 1° longitude');

    // identical points => 0
    const d2 = kmBetween({ latitude: 12.34, longitude: 56.78 }, { latitude: 12.34, longitude: 56.78 });
    console.log('Distance identical points:', d2);
    if (!approxEqual(d2, 0, 1e-6)) throw new Error('Identical points did not return 0');

    // missing inputs => Infinity
    const d3 = kmBetween(null, null);
    console.log('Distance with missing inputs:', d3);
    if (d3 !== Infinity) throw new Error('Missing inputs should return Infinity');

    console.log('kmBetween smoke-check: PASSED');
    process.exit(0);
  } catch (e) {
    console.error('kmBetween smoke-check: FAILED');
    console.error(e && e.message ? e.message : e);
    process.exit(1);
  }
})();
