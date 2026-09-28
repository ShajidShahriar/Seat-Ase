// ---- The map's look: OpenFreeMap's Positron style, recoloured to sit under the app's greys ----

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const HIDDEN_LAYERS = /shield|boundary|aeroway|railway_.*dash|label_country|label_state|highway-name-path|landcover_ice|landcover_glacier/;

let cached = null;

export async function loadMapStyle() {
  if (cached) return structuredClone(cached);
  const style = await (await fetch(STYLE_URL)).json();
  style.layers = style.layers.filter((layer) => !HIDDEN_LAYERS.test(layer.id));

  const paint = (id, props) => {
    const layer = style.layers.find((l) => l.id === id);
    if (layer) layer.paint = { ...(layer.paint ?? {}), ...props };
  };
  paint('background', { 'background-color': '#f2f2f4' });
  paint('water', { 'fill-color': '#cfe0ef' });
  paint('park', { 'fill-color': '#dfeadb', 'fill-opacity': 1 });
  paint('landcover_wood', { 'fill-color': '#dfeadb', 'fill-opacity': 0.8 });
  paint('landuse_residential', { 'fill-color': '#ececef', 'fill-opacity': 1 });
  paint('building', { 'fill-color': '#e3e3e8', 'fill-outline-color': '#dadadf' });
  paint('waterway', { 'line-color': '#cfe0ef' });

  for (const layer of style.layers) {
    if (layer.type === 'line' && /highway|road|tunnel/.test(layer.id)) {
      layer.paint = { ...(layer.paint ?? {}), 'line-color': /casing/.test(layer.id) ? '#dcdce1' : '#ffffff' };
    }
    if (layer.type === 'symbol') {
      const major = /label_city|label_town/.test(layer.id);
      layer.paint = { ...(layer.paint ?? {}), 'text-color': major ? '#3c3c43' : '#8e8e93', 'text-halo-color': 'rgba(255,255,255,0.9)', 'text-halo-width': 1.4 };
    }
  }

  cached = style;
  return structuredClone(style);
}

// ---- A curved line between two points: how the app previews a trip, since it has no road routing ----

export function arc(from, to, bend = 0.22, steps = 64) {
  const midLng = (from.lng + to.lng) / 2;
  const midLat = (from.lat + to.lat) / 2;
  const dLng = to.lng - from.lng;
  const dLat = to.lat - from.lat;
  const controlLng = midLng - dLat * bend;
  const controlLat = midLat + dLng * bend;
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    points.push([u * u * from.lng + 2 * u * t * controlLng + t * t * to.lng, u * u * from.lat + 2 * u * t * controlLat + t * t * to.lat]);
  }
  return points;
}

// ---- Which way a car at `from` would face to drive to `to`, in degrees clockwise from north ----

export function bearing(from, to) {
  return (Math.atan2(to.lng - from.lng, to.lat - from.lat) * 180) / Math.PI;
}
