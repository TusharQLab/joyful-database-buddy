import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  availableFuels,
  statusLevel,
  STATUS_COLORS,
  type StationWithStatus,
} from "@/lib/stations";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.round(diff / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function popupHtml(station: StationWithStatus) {
  const status = station.live_status;
  const fuels = availableFuels(station);
  const queue =
    !status || !status.power_status
      ? "Station offline"
      : status.queue_minutes === null
        ? "Unknown"
        : `~${status.queue_minutes} min`;
  const color = STATUS_COLORS[statusLevel(station)];

  return `
    <div style="min-width:180px">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="width:10px;height:10px;border-radius:9999px;background:${color};display:inline-block"></span>
        <strong style="font-size:14px">${escapeHtml(station.name)}</strong>
      </div>
      <div style="color:#6b7280;font-size:12px;margin-top:2px">${escapeHtml(
        [station.company, station.city].filter(Boolean).join(" · ") || "—",
      )}</div>
      <dl style="margin:8px 0 0;font-size:12px;line-height:1.5">
        <div><span style="color:#6b7280">Available: </span>${
          fuels.length ? escapeHtml(fuels.join(", ")) : "None right now"
        }</div>
        <div><span style="color:#6b7280">Queue: </span>${queue}</div>
        <div><span style="color:#6b7280">Updated: </span>${
          status ? relativeTime(status.updated_at) : "No data"
        }</div>
      </dl>
    </div>
  `;
}

function markerIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
}

export default function StationMap({ stations }: { stations: StationWithStatus[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [28.6139, 77.209],
      zoom: 11,
      zoomControl: true,
      scrollWheelZoom: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    const points: [number, number][] = [];

    for (const station of stations) {
      const point: [number, number] = [station.latitude, station.longitude];
      points.push(point);
      L.marker(point, {
        icon: markerIcon(STATUS_COLORS[statusLevel(station)]),
        title: station.name,
      })
        .bindPopup(popupHtml(station), { closeButton: true, maxWidth: 260 })
        .addTo(layer);
    }

    if (points.length) {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 14 });
    }
  }, [stations]);

  return <div ref={containerRef} className="h-full w-full" aria-label="Map of fuel stations" />;
}
