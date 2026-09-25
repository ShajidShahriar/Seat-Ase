'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DHAKA_CENTER = [23.7937, 90.4066];

// ---- Pins: a circle for where you are, a blue circle for the stand, a square for where you are going ----

function pin(shape, colour) {
  const radius = shape === 'square' ? '3px' : '50%';
  return L.divIcon({
    className: '',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    html: `<div style="width:18px;height:18px;box-sizing:border-box;border-radius:${radius};background:${colour};border:3px solid #fff;box-shadow:0 0 0 1px rgb(0 0 0 / 0.25)"></div>`,
  });
}

const ICONS = {
  pickup: pin('circle', '#000000'),
  stand: pin('circle', '#0040dd'),
  drop: pin('square', '#000000'),
};

// ---- The map: shows the pickup, its stand and the drop off, and reports taps ----

export default function RideMap({ pickup, stand, drop, onTap }) {
  const element = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const tapHandler = useRef(onTap);
  tapHandler.current = onTap;

  useEffect(() => {
    map.current = L.map(element.current, { center: DHAKA_CENTER, zoom: 13 });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    map.current.on('click', (event) => tapHandler.current?.({ lat: event.latlng.lat, lng: event.latlng.lng }));
    return () => {
      map.current.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    layer.current.clearLayers();
    const points = [];
    const add = (spot, icon) => {
      if (!spot) return;
      L.marker([spot.lat, spot.lng], { icon, interactive: false, keyboard: false }).addTo(layer.current);
      points.push([spot.lat, spot.lng]);
    };
    if (pickup && stand) {
      L.polyline(
        [
          [pickup.lat, pickup.lng],
          [stand.lat, stand.lng],
        ],
        { color: '#0040dd', weight: 3, dashArray: '2 8', lineCap: 'round' },
      ).addTo(layer.current);
    }
    add(pickup, ICONS.pickup);
    add(stand, ICONS.stand);
    add(drop, ICONS.drop);
    if (points.length === 1) map.current.setView(points[0], 15);
    else if (points.length > 1) map.current.fitBounds(points, { padding: [40, 40], maxZoom: 16 });
  }, [pickup, stand, drop]);

  return <div ref={element} className="h-56 overflow-hidden rounded-cell bg-fill" role="application" aria-label="Map of Dhaka. Tap to drop a pin." />;
}
