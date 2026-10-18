/* Distance helpers. ZIP lookup uses a bundled U.S. Census table, so nothing is sent to any outside service. */
window.Geo = (function () {
  let geo = null;
  let zips = null;

  async function load() {
    if (!geo) {
      try { geo = await (await fetch("data/geo.json")).json(); } catch (e) { geo = {}; }
    }
    return geo;
  }

  // Returns [lat, lon] for a 5-digit ZIP code, or null if it isn't a known ZIP.
  async function zipPoint(zip) {
    zip = String(zip || "").trim().slice(0, 5);
    if (!/^\d{5}$/.test(zip)) return null;
    if (!zips) {
      zips = new Map();
      try {
        const txt = await (await fetch("data/zips.txt")).text();
        for (const line of txt.split("\n")) {
          const [z, la, lo] = line.split(",");
          if (z) zips.set(z, [Number(la), Number(lo)]);
        }
      } catch (e) { /* leave empty */ }
    }
    return zips.get(zip) || null;
  }

  // Straight-line (great-circle) distance in miles.
  function miles(a, b) {
    const R = 3958.8, rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // Distance in miles from origin to a school (by id), or null if the school has no coordinates.
  function milesTo(origin, id) {
    const p = geo && geo[id];
    return origin && p ? miles(origin, p) : null;
  }

  return { load, zipPoint, miles, milesTo };
})();
