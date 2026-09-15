'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  type GeoJSONSource,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@/components/dashboard/situational-map.css';
import './fire-situation-map.css';
import {
  CHINA_BOUNDS,
  CHINA_DEFAULT_CENTER,
  CHINA_DEFAULT_ZOOM,
  CHINA_MAX_ZOOM,
  CHINA_MIN_ZOOM,
  PLATFORM_DARK_STYLE,
} from '@/lib/map/china-basemap';
import type { ControlStrategy, FireTracing, SpreadPrediction } from '@/types/alert';
import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson';

export type FireMapDevice = {
  device_id: string;
  device_name: string;
  longitude: number;
  latitude: number;
  status?: string;
};

type SpreadKey = '1h' | '3h' | '6h';

type Props = {
  tracing: FireTracing | null;
  devices?: FireMapDevice[];
  showSpread?: boolean;
  loading?: boolean;
  className?: string;
};

const SPREAD_STYLE: Record<
  SpreadKey,
  { fill: string; line: string; fillOpacity: number }
> = {
  '6h': { fill: '#f59e0b', line: '#f59e0b', fillOpacity: 0.08 },
  '3h': { fill: '#f59e0b', line: '#fbbf24', fillOpacity: 0.12 },
  '1h': { fill: '#ef4444', line: '#f87171', fillOpacity: 0.18 },
};

function toNum(value?: number | string | null): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function asStrategy(value: FireTracing['control_strategy']): ControlStrategy | null {
  if (!value || typeof value !== 'object') return null;
  return value as ControlStrategy;
}

/** 球面近似圆 → GeoJSON Polygon（半径单位 km） */
function circlePolygon(
  lng: number,
  lat: number,
  radiusKm: number,
  steps = 64,
): Feature<Polygon> {
  const coords: [number, number][] = [];
  const R = 6371;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const ang = Math.max(radiusKm, 0.05) / R;

  for (let i = 0; i <= steps; i++) {
    const brng = (i / steps) * 2 * Math.PI;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(ang) + Math.cos(lat1) * Math.sin(ang) * Math.cos(brng),
    );
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(brng) * Math.sin(ang) * Math.cos(lat1),
        Math.cos(ang) - Math.sin(lat1) * Math.sin(lat2),
      );
    coords.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }

  return {
    type: 'Feature',
    properties: { radius_km: radiusKm },
    geometry: { type: 'Polygon', coordinates: [coords] },
  };
}

function emptyFC<G extends Point | Polygon | LineString>(): FeatureCollection<G> {
  return { type: 'FeatureCollection', features: [] };
}

function buildSpreadGeo(
  lng: number,
  lat: number,
  pred: SpreadPrediction | null | undefined,
): FeatureCollection<Polygon> {
  const r = toNum(pred?.radius_km);
  if (r == null || r <= 0) return emptyFC();
  return { type: 'FeatureCollection', features: [circlePolygon(lng, lat, r)] };
}

function buildBeltGeo(strategy: ControlStrategy | null): FeatureCollection<LineString> {
  const pts = (strategy?.isolation_belt || [])
    .map((p) => {
      const lng = toNum(p.longitude);
      const lat = toNum(p.latitude);
      if (lng == null || lat == null) return null;
      return [lng, lat] as [number, number];
    })
    .filter((p): p is [number, number] => p != null);

  if (pts.length < 2) return emptyFC();
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: pts },
      },
    ],
  };
}

function ensureFireLayers(map: MapLibreMap) {
  const ensureSource = (id: string) => {
    if (!map.getSource(id)) {
      map.addSource(id, { type: 'geojson', data: emptyFC() });
    }
  };

  ensureSource('spread-6h');
  ensureSource('spread-3h');
  ensureSource('spread-1h');
  ensureSource('isolation-belt');

  const addFillLine = (
    source: string,
    key: SpreadKey,
  ) => {
    const fillId = `${source}-fill`;
    const lineId = `${source}-line`;
    const style = SPREAD_STYLE[key];
    if (!map.getLayer(fillId)) {
      map.addLayer({
        id: fillId,
        type: 'fill',
        source,
        paint: {
          'fill-color': style.fill,
          'fill-opacity': style.fillOpacity,
        },
      });
    }
    if (!map.getLayer(lineId)) {
      map.addLayer({
        id: lineId,
        type: 'line',
        source,
        paint: {
          'line-color': style.line,
          'line-width': 1.5,
          'line-opacity': 0.85,
          'line-dasharray': key === '6h' ? [2, 1.5] : [1, 0],
        },
      });
    }
  };

  addFillLine('spread-6h', '6h');
  addFillLine('spread-3h', '3h');
  addFillLine('spread-1h', '1h');

  if (!map.getLayer('isolation-belt-line')) {
    map.addLayer({
      id: 'isolation-belt-line',
      type: 'line',
      source: 'isolation-belt',
      paint: {
        'line-color': '#3b82f6',
        'line-width': 2.5,
        'line-dasharray': [2, 1.5],
        'line-opacity': 0.95,
      },
    });
  }
}

function setSpreadVisibility(
  map: MapLibreMap,
  show: boolean,
  enabled: Record<SpreadKey, boolean>,
) {
  (['1h', '3h', '6h'] as SpreadKey[]).forEach((key) => {
    const visible = show && enabled[key] ? 'visible' : 'none';
    const fillId = `spread-${key}-fill`;
    const lineId = `spread-${key}-line`;
    if (map.getLayer(fillId)) map.setLayoutProperty(fillId, 'visibility', visible);
    if (map.getLayer(lineId)) map.setLayoutProperty(lineId, 'visibility', visible);
  });
}

function buildOriginMarker(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'sf-device-marker is-alarm sf-fire-origin';
  el.innerHTML = `
    <span class="sf-device-marker__ring" style="color:#ef4444"></span>
    <span class="sf-device-marker__ring sf-device-marker__ring--delay" style="color:#ef4444"></span>
    <span class="sf-device-marker__dot" style="background:#ef4444;color:#ef4444"></span>
    <div class="sf-device-marker__meta">
      <div class="sf-device-marker__name">起火点</div>
    </div>
  `;
  return el;
}

function buildDeviceMarker(device: FireMapDevice): HTMLDivElement {
  const color =
    device.status === 'alarm'
      ? '#ef4444'
      : device.status === 'offline'
        ? '#8b9bb4'
        : '#10b981';
  const el = document.createElement('div');
  el.className = 'sf-device-marker';
  el.title = `${device.device_name} (${device.device_id})`;
  el.innerHTML = `
    <span class="sf-device-marker__ring" style="color:${color}"></span>
    <span class="sf-device-marker__dot" style="background:${color};color:${color}"></span>
    <div class="sf-device-marker__meta">
      <div class="sf-device-marker__name"></div>
      <div class="sf-device-marker__sub">
        <span class="sf-device-marker__type"></span>
      </div>
    </div>
  `;
  const nameEl = el.querySelector('.sf-device-marker__name');
  const typeEl = el.querySelector('.sf-device-marker__type');
  if (nameEl) nameEl.textContent = device.device_name || device.device_id;
  if (typeEl) typeEl.textContent = device.device_id;
  return el;
}

function computeFitBounds(
  lng: number | null,
  lat: number | null,
  tracing: FireTracing | null,
  devices: FireMapDevice[],
  strategy: ControlStrategy | null,
): [[number, number], [number, number]] {
  const pts: [number, number][] = [];
  if (lng != null && lat != null) {
    pts.push([lng, lat]);
    const radii = [
      toNum(tracing?.spread_prediction_6h?.radius_km),
      toNum(tracing?.spread_prediction_3h?.radius_km),
      toNum(tracing?.spread_prediction_1h?.radius_km),
    ].filter((r): r is number => r != null && r > 0);
    const maxR = radii.length ? Math.max(...radii) : 1;
    // 粗略：1°纬度≈111km
    const dLat = maxR / 111;
    const dLng = maxR / (111 * Math.cos((lat * Math.PI) / 180) || 1);
    pts.push([lng - dLng, lat - dLat], [lng + dLng, lat + dLat]);
  }
  for (const d of devices) {
    if (Number.isFinite(d.longitude) && Number.isFinite(d.latitude)) {
      pts.push([d.longitude, d.latitude]);
    }
  }
  for (const p of strategy?.isolation_belt || []) {
    const x = toNum(p.longitude);
    const y = toNum(p.latitude);
    if (x != null && y != null) pts.push([x, y]);
  }
  if (pts.length === 0) return CHINA_BOUNDS;

  let minLng = pts[0][0];
  let maxLng = pts[0][0];
  let minLat = pts[0][1];
  let maxLat = pts[0][1];
  for (const [x, y] of pts) {
    minLng = Math.min(minLng, x);
    maxLng = Math.max(maxLng, x);
    minLat = Math.min(minLat, y);
    maxLat = Math.max(maxLat, y);
  }
  const padLng = Math.max((maxLng - minLng) * 0.25, 0.02);
  const padLat = Math.max((maxLat - minLat) * 0.25, 0.02);
  return [
    [
      Math.max(CHINA_BOUNDS[0][0], minLng - padLng),
      Math.max(CHINA_BOUNDS[0][1], minLat - padLat),
    ],
    [
      Math.min(CHINA_BOUNDS[1][0], maxLng + padLng),
      Math.min(CHINA_BOUNDS[1][1], maxLat + padLat),
    ],
  ];
}

export default function FireSituationMap({
  tracing,
  devices = [],
  showSpread = true,
  loading = false,
  className,
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const originMarkerRef = useRef<Marker | null>(null);
  const deviceMarkersRef = useRef<Map<string, Marker>>(new Map());
  const fittedKeyRef = useRef('');
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [spreadEnabled, setSpreadEnabled] = useState<Record<SpreadKey, boolean>>({
    '1h': true,
    '3h': true,
    '6h': true,
  });

  const strategy = useMemo(() => asStrategy(tracing?.control_strategy ?? null), [tracing]);
  const lng = toNum(tracing?.origin_longitude);
  const lat = toNum(tracing?.origin_latitude);

  const geo = useMemo(() => {
    if (lng == null || lat == null) {
      return {
        s1: emptyFC<Polygon>(),
        s3: emptyFC<Polygon>(),
        s6: emptyFC<Polygon>(),
        belt: emptyFC<LineString>(),
      };
    }
    return {
      s1: buildSpreadGeo(lng, lat, tracing?.spread_prediction_1h),
      s3: buildSpreadGeo(lng, lat, tracing?.spread_prediction_3h),
      s6: buildSpreadGeo(lng, lat, tracing?.spread_prediction_6h),
      belt: buildBeltGeo(strategy),
    };
  }, [lng, lat, tracing, strategy]);

  const bounds = useMemo(
    () => computeFitBounds(lng, lat, tracing, devices, strategy),
    [lng, lat, tracing, devices, strategy],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    let cancelled = false;
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container,
        style: PLATFORM_DARK_STYLE,
        center: CHINA_DEFAULT_CENTER,
        zoom: CHINA_DEFAULT_ZOOM,
        minZoom: CHINA_MIN_ZOOM,
        maxZoom: CHINA_MAX_ZOOM,
        maxBounds: CHINA_BOUNDS,
        renderWorldCopies: false,
        attributionControl: { compact: true },
        failIfMajorPerformanceCaveat: false,
      });
    } catch (err) {
      setMapError(err instanceof Error ? err.message : '地图初始化失败');
      return;
    }

    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

    const kickResize = () => {
      if (!cancelled) map.resize();
    };

    map.on('load', () => {
      if (cancelled) return;
      ensureFireLayers(map);
      setSpreadVisibility(map, showSpread, spreadEnabled);
      kickResize();
      setMapReady(true);
      requestAnimationFrame(kickResize);
      window.setTimeout(kickResize, 150);
    });

    map.on('error', (e) => {
      const msg = e.error?.message || '';
      if (/style|worker|webgl/i.test(msg)) setMapError(msg);
    });

    mapRef.current = map;
    const onWinResize = () => map.resize();
    window.addEventListener('resize', onWinResize);
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container);
    if (wrapRef.current) ro.observe(wrapRef.current);

    return () => {
      cancelled = true;
      window.removeEventListener('resize', onWinResize);
      ro.disconnect();
      originMarkerRef.current?.remove();
      originMarkerRef.current = null;
      for (const m of deviceMarkersRef.current.values()) m.remove();
      deviceMarkersRef.current.clear();
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // GeoJSON 同步
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    ensureFireLayers(map);
    (map.getSource('spread-1h') as GeoJSONSource | undefined)?.setData(geo.s1);
    (map.getSource('spread-3h') as GeoJSONSource | undefined)?.setData(geo.s3);
    (map.getSource('spread-6h') as GeoJSONSource | undefined)?.setData(geo.s6);
    (map.getSource('isolation-belt') as GeoJSONSource | undefined)?.setData(geo.belt);
  }, [geo, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    setSpreadVisibility(map, showSpread, spreadEnabled);
  }, [showSpread, spreadEnabled, mapReady]);

  // 起火点标记
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (lng == null || lat == null) {
      originMarkerRef.current?.remove();
      originMarkerRef.current = null;
      return;
    }

    if (!originMarkerRef.current) {
      originMarkerRef.current = new Marker({
        element: buildOriginMarker(),
        anchor: 'center',
      })
        .setLngLat([lng, lat])
        .addTo(map);
    } else {
      originMarkerRef.current.setLngLat([lng, lat]);
    }
  }, [lng, lat, mapReady]);

  // 设备标记
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const nextIds = new Set(
      devices
        .filter((d) => Number.isFinite(d.longitude) && Number.isFinite(d.latitude))
        .map((d) => d.device_id),
    );

    for (const [id, marker] of deviceMarkersRef.current) {
      if (!nextIds.has(id)) {
        marker.remove();
        deviceMarkersRef.current.delete(id);
      }
    }

    for (const device of devices) {
      if (!Number.isFinite(device.longitude) || !Number.isFinite(device.latitude)) continue;
      let marker = deviceMarkersRef.current.get(device.device_id);
      if (!marker) {
        marker = new Marker({
          element: buildDeviceMarker(device),
          anchor: 'center',
        })
          .setLngLat([device.longitude, device.latitude])
          .addTo(map);
        deviceMarkersRef.current.set(device.device_id, marker);
      } else {
        marker.setLngLat([device.longitude, device.latitude]);
      }
      marker.getElement().classList.toggle('is-compact', map.getZoom() < 9);
    }
  }, [devices, mapReady]);

  // 视野
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const key = JSON.stringify(bounds) + String(tracing?.id ?? 'none');
    if (key === fittedKeyRef.current) return;
    fittedKeyRef.current = key;
    map.resize();
    map.fitBounds(bounds, {
      padding: 48,
      maxZoom: tracing ? 12 : 5,
      duration: tracing ? 700 : 0,
    });
  }, [bounds, tracing, mapReady]);

  const toggleSpread = (key: SpreadKey) => {
    setSpreadEnabled((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div
      ref={wrapRef}
      className={`relative h-full w-full min-h-[240px] ${className || ''}`}
      style={{ minHeight: 240 }}
    >
      <div ref={containerRef} className="absolute inset-0 sf-map-container" />

      {tracing && mapReady && (
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-2 pointer-events-none">
          <div className="text-[10px] text-[#8b9bb4] font-mono bg-[#0a1628]/80 border border-[#1e3a5f] rounded px-2 py-1">
            {lng != null && lat != null
              ? `E${lng.toFixed(4)}° N${lat.toFixed(4)}°`
              : '坐标未知'}
            {' · '}
            {tracing.algorithm || 'FARSITE'}
          </div>
          {showSpread && (
            <div className="flex items-center gap-1 pointer-events-auto">
              {(['1h', '3h', '6h'] as SpreadKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleSpread(key)}
                  className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                    spreadEnabled[key]
                      ? 'bg-[#f59e0b]/20 border-[#f59e0b]/50 text-[#fbbf24]'
                      : 'bg-[#0a1628]/70 border-[#1e3a5f] text-[#8b9bb4]'
                  }`}
                >
                  {key} 蔓延
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!tracing && !loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="rounded border border-[#1e3a5f] bg-[#0c1a2e]/85 px-3 py-2 text-xs text-[#8b9bb4]">
            请选择左侧火情记录
          </div>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="rounded border border-[#1e3a5f] bg-[#0c1a2e]/85 px-3 py-2 text-xs text-[#8b9bb4]">
            加载详情…
          </div>
        </div>
      )}

      {mapError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="rounded border border-[#ef4444]/40 bg-[#0c1a2e]/90 px-3 py-2 text-xs text-[#ef4444]">
            {mapError}
          </div>
        </div>
      )}

      {tracing && !loading && lng == null && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="rounded border border-[#f59e0b]/40 bg-[#0c1a2e]/90 px-3 py-1.5 text-[11px] text-[#f59e0b]">
            该火情缺少起火点坐标
          </div>
        </div>
      )}
    </div>
  );
}
