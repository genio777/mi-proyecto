// Synthetic, internally consistent road responses for browser behavior tests.
const metresBetween = (a, b) => Math.hypot((b[0] - a[0]) * 73, (b[1] - a[1]) * 111) * 1000;
const snapped = location => ({ location, distance: 0 });

export function routeResponse(url) {
  const parsed = new URL(url);
  const coordinates = decodeURIComponent(parsed.pathname.split('/driving/')[1]).split(';').map(point => point.split(',').map(Number));
  if (parsed.pathname.includes('/table/')) {
    const indices = name => {
      const value = parsed.searchParams.get(name);
      return !value || value === 'all' ? coordinates.map((_, index) => index) : value.split(';').map(Number);
    };
    const sources = indices('sources').map(index => coordinates[index]);
    const destinations = indices('destinations').map(index => coordinates[index]);
    const distances = sources.map(from => destinations.map(to => metresBetween(from, to)));
    return { code: 'Ok', distances, durations: distances.map(row => row.map(metres => metres / 1000 * 60)),
      sources: sources.map(snapped), destinations: destinations.map(snapped) };
  }
  const legs = coordinates.slice(1).map((point, index) => {
    const distance = metresBetween(coordinates[index], point);
    return { distance, duration: distance / 1000 * 60, steps: [] };
  });
  return { code: 'Ok', routes: [{ distance: legs.reduce((total, leg) => total + leg.distance, 0),
    duration: legs.reduce((total, leg) => total + leg.duration, 0),
    geometry: { type: 'LineString', coordinates }, legs }], waypoints: coordinates.map(snapped) };
}
