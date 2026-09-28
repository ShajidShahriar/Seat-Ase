'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { arc, loadMapStyle } from '../lib/mapStyle.js';

export const DHAKA_HOME = { center: [90.4066, 23.7885], zoom: 13.6 };
const FIT_MARGIN = { top: 90, bottom: 50, left: 50, right: 50 };
const EMPTY_LINE = { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } };
const ARROW = '<svg width="16" height="18" viewBox="0 0 16 18" aria-hidden="true"><path d="M8 1 14.5 16.5 8 13 1.5 16.5Z" fill="#000"/></svg>';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const toLngLat = (p) => [p.lng, p.lat];

// ---- The markers, drawn by hand in CSS (globals.css, "map markers") ----

function markerElement(kind, spec) {
  const outer = document.createElement('div');
  const inner = document.createElement('div');
  inner.className = 'map-drop-in';
  if (kind === 'pin') inner.innerHTML = '<div class="map-pin"></div>';
  if (kind === 'drop') inner.innerHTML = `<div class="map-drop ${spec.label ? 'numbered' : ''} ${spec.done ? 'done' : ''}">${spec.label ?? ''}</div>`;
  if (kind === 'stand') {
    inner.innerHTML = `<div class="map-stand ${spec.mode ?? ''}">${spec.badge ? `<span class="map-badge">${spec.badge}</span>` : ''}<span class="ring"></span><span class="ring r2"></span><span class="core"></span></div>`;
  }
  if (kind === 'tesla') inner.innerHTML = `<div class="map-tesla" style="--heading:${spec.heading ?? 0}deg">${ARROW}</div>`;
  outer.appendChild(inner);
  return outer;
}

// ---- The map. `scene` says what to show; the component works out what changed ----
// scene: { pin, stand: { lat, lng, mode, badge }, stands: [ ...more stands ], drops: [{ lat, lng, label, done }], walk, route: [from, to] or [[from, to], ...], approach, tesla: { lat, lng, heading }, focus: 'home' | points }

export default function MapView({ scene = {}, padding, className = '' }) {
  const container = useRef(null);
  const map = useRef(null);
  const markers = useRef(new Map());
  const drawnRoute = useRef('');
  const frame = useRef(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let instance;
    loadMapStyle().then((style) => {
      if (cancelled) return;
      instance = new maplibregl.Map({ container: container.current, style, ...DHAKA_HOME, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false });
      instance.touchZoomRotate.disableRotation();
      instance.on('load', () => {
        const round = { 'line-cap': 'round', 'line-join': 'round' };
        for (const id of ['approach', 'walk', 'route']) instance.addSource(id, { type: 'geojson', data: EMPTY_LINE });
        instance.addLayer({ id: 'approach', type: 'line', source: 'approach', layout: round, paint: { 'line-color': '#8e8e93', 'line-width': 4, 'line-dasharray': [1.5, 1.5] } });
        instance.addLayer({ id: 'walk', type: 'line', source: 'walk', layout: round, paint: { 'line-color': '#0a84ff', 'line-width': 4, 'line-dasharray': [0, 2] } });
        instance.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: round, paint: { 'line-color': '#ffffff', 'line-width': 9 } });
        instance.addLayer({ id: 'route', type: 'line', source: 'route', layout: round, paint: { 'line-color': '#000000', 'line-width': 5 } });
        map.current = instance;
        setReady(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame.current);
      instance?.remove();
      map.current = null;
      markers.current.clear();
    };
  }, []);

  useEffect(() => {
    if (ready && padding) map.current.setPadding(padding);
  }, [ready, padding?.top, padding?.bottom, padding?.left, padding?.right]);

  const signature = JSON.stringify(scene);

  useEffect(() => {
    if (!ready) return;
    const instance = map.current;
    const quick = reducedMotion();

    // Markers: only replace the ones that changed, so pins don't re-drop on every render
    const wanted = new Map();
    if (scene.pin) wanted.set('pin', ['pin', scene.pin]);
    if (scene.stand) wanted.set('stand', ['stand', scene.stand]);
    (scene.stands ?? []).forEach((stand, i) => wanted.set(`stand${i}`, ['stand', stand]));
    (scene.drops ?? []).forEach((drop, i) => wanted.set(`drop${i}`, ['drop', drop]));
    if (scene.tesla) wanted.set('tesla', ['tesla', scene.tesla]);
    for (const [key, entry] of markers.current) {
      if (!wanted.has(key) || JSON.stringify(wanted.get(key)[1]) !== entry.sig) {
        entry.marker.remove();
        markers.current.delete(key);
      }
    }
    for (const [key, [kind, spec]] of wanted) {
      if (markers.current.has(key)) continue;
      const marker = new maplibregl.Marker({ element: markerElement(kind, spec) }).setLngLat(toLngLat(spec)).addTo(instance);
      markers.current.set(key, { marker, sig: JSON.stringify(spec) });
    }

    // Lines: the walk to the stand, the Tesla's approach, and the trip, which draws itself once when it first appears
    const setLine = (id, coords) => instance.getSource(id).setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } });
    setLine('walk', scene.walk && scene.pin && scene.stand ? [toLngLat(scene.pin), toLngLat(scene.stand)] : []);
    setLine('approach', scene.approach ? arc(scene.approach[0], scene.approach[1], -0.18) : []);

    const legs = !scene.route ? [] : Array.isArray(scene.route[0]) ? scene.route : [scene.route];
    const routePath = legs.flatMap(([from, to], i) => arc(from, to, i % 2 ? -0.2 : 0.22).slice(i ? 1 : 0));
    const routeKey = JSON.stringify(legs);
    cancelAnimationFrame(frame.current);
    if (routeKey !== drawnRoute.current && routePath.length && !quick) {
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / 900);
        const eased = 1 - Math.pow(1 - t, 3);
        setLine('route', routePath.slice(0, Math.max(2, Math.round(eased * routePath.length))));
        if (t < 1) frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    } else {
      setLine('route', routePath);
    }
    drawnRoute.current = routeKey;

    // Camera: fit what matters, or go home
    const duration = quick ? 0 : 1100;
    const focus = scene.focus === 'home' || !scene.focus ? null : scene.focus.map(toLngLat);
    if (!focus || focus.length === 0) {
      if (scene.focus === 'home') instance.flyTo({ ...DHAKA_HOME, duration });
      return;
    }
    if (focus.length === 1) {
      instance.flyTo({ center: focus[0], zoom: scene.zoom ?? 15.5, duration });
      return;
    }
    const bounds = focus.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(focus[0], focus[0]));
    instance.fitBounds(bounds, { padding: FIT_MARGIN, maxZoom: scene.zoom ?? 15.5, duration });
  }, [ready, signature]);

  return <div ref={container} className={className} role="application" aria-label="Map of Dhaka" />;
}
