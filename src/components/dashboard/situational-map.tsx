'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  type GeoJSONSource,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './situational-map.css';
import {
  CHINA_BOUNDS,
  CHINA_DEFAULT_CENTER,
  CHINA_DEFAULT_ZOOM,
  CHINA_MAX_ZOOM,
  CHINA_MIN_ZOOM,
  PLATFORM_DARK_STYLE,
} from '@/lib/map/china-basemap';
import type { DashboardFireHighlight, DashboardMapDevice } from '@/types/dashboard';
import type { Feature, FeatureCollection, Point } from 'geojson';

export type SituationalMapLayer = 'standard' | 'thermal' | 'fire';

type Props = {
  devices: DashboardMapDevice[];
  fireHighlights?: DashboardFireHighlight[];
  layer?: SituationalMapLayer;
  loading?: boolean;
  onDeviceClick?: (device: DashboardMapDevice) => void;
  className?: string;
};

const DEFAULT_CENTER = CHINA_DEFAULT_CENTER;
const DEFAULT_ZOOM = CHINA_DEFAULT_ZOOM;
const DARK_STYLE = PLATFORM_DARK_STYLE;
/** 低于此缩放：只显示圆点，悬停才出详情（不销毁标注） */
const COMPACT_ZOOM = 11;

function statusColor(status: string): string {
  if (status === 'alarm') return '#ef4444';
  if (status === 'offline') return '#8b9bb4';
  if (status === 'maintenance') return '#f59e0b';
  return '#10b981';
}

function statusLabel(device: DashboardMapDevice): string {
  if (device.status_display) return device.status_display;
  if (device.status === 'alarm') return '告警';
  if (device.status === 'offline') return '离线';
  if (device.status === 'maintenance') return '维护';
  if (device.status === 'online') return '在线';
  return device.status || '-';
}

function typeLabel(device: DashboardMapDevice): string {
  return device.device_type_display || device.device_type || '设备';
}

function devicesToGeoJSON(devices: DashboardMapDevice[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: devices
      .filter((d) => Number.isFinite(d.longitude) && Number.isFinite(d.latitude))
      .map((d) => ({
        type: 'Feature' as const,
        id: d.id,
        properties: {
          id: d.id,
          status: d.status,
          weight: d.status === 'alarm' ? 1 : d.status === 'offline' ? 0.35 : 0.55,
          color: statusColor(d.status),
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [d.longitude, d.latitude],
        },
      })),
  };
}

function firesToGeoJSON(fires: DashboardFireHighlight[]): FeatureCollection<Point> {
  const features: Feature<Point>[] = [];
  for (const ft of fires) {
    const lng = Number(ft.origin_longitude);
    const lat = Number(ft.origin_latitude);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    features.push({
      type: 'Feature',
      id: ft.id,
      properties: { id: ft.id, title: ft.alert_title || ft.alert_id || `火情#${ft.id}` },
      geometry: { type: 'Point', coordinates: [lng, lat] },
    });
  }
  return { type: 'FeatureCollection', features };
}

function clampToChina(
  bounds: [[number, number], [number, number]],
): [[number, number], [number, number]] {
  const [[minLng, minLat], [maxLng, maxLat]] = bounds;
  return [
    [
      Math.max(CHINA_BOUNDS[0][0], Math.min(minLng, CHINA_BOUNDS[1][0])),
      Math.max(CHINA_BOUNDS[0][1], Math.min(minLat, CHINA_BOUNDS[1][1])),
    ],
    [
      Math.min(CHINA_BOUNDS[1][0], Math.max(maxLng, CHINA_BOUNDS[0][0])),
      Math.min(CHINA_BOUNDS[1][1], Math.max(maxLat, CHINA_BOUNDS[0][1])),
    ],
  ];
}

function computeBounds(
  devices: DashboardMapDevice[],
  fires: DashboardFireHighlight[],
): [[number, number], [number, number]] {
  const pts: [number, number][] = [];
  for (const d of devices) {
    if (Number.isFinite(d.longitude) && Number.isFinite(d.latitude)) {
      pts.push([d.longitude, d.latitude]);
    }
  }
  for (const ft of fires) {
    const lng = Number(ft.origin_longitude);
    const lat = Number(ft.origin_latitude);
    if (Number.isFinite(lng) && Number.isFinite(lat)) pts.push([lng, lat]);
  }
  if (pts.length === 0) return CHINA_BOUNDS;
  let minLng = pts[0][0];
  let maxLng = pts[0][0];
  let minLat = pts[0][1];
  let maxLat = pts[0][1];
  for (const [lng, lat] of pts) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  const padLng = Math.max((maxLng - minLng) * 0.25, 0.06);
  const padLat = Math.max((maxLat - minLat) * 0.25, 0.06);
  return clampToChina([
    [minLng - padLng, minLat - padLat],
    [maxLng + padLng, maxLat + padLat],
  ]);
}

function clearMarkers(markers: Map<number, Marker>, keys: Map<number, string>) {
  for (const m of markers.values()) m.remove();
  markers.clear();
  keys.clear();
}

function markerKey(d: DashboardMapDevice): string {
  return [
    d.device_name,
    d.status,
    d.status_display || '',
    d.device_type,
    d.device_type_display || '',
    d.forest_zone || '',
    d.region || '',
    d.longitude,
    d.latitude,
  ].join('|');
}

function buildMarkerEl(
  device: DashboardMapDevice,
  onClick?: (d: DashboardMapDevice) => void,
): HTMLDivElement {
  const color = statusColor(device.status);
  const root = document.createElement('div');
  root.className = `sf-pin${device.status === 'alarm' ? ' is-alarm' : ''}`;
  root.dataset.deviceId = String(device.id);

  const zone = device.forest_zone || device.region || '';
  root.innerHTML = `
    <span class="sf-pin__pulse" style="--pin:${color}"></span>
    <span class="sf-pin__dot" style="--pin:${color}"></span>
    <div class="sf-pin__card">
      <div class="sf-pin__name"></div>
      <div class="sf-pin__meta">
        <span class="sf-pin__status" style="color:${color}"></span>
        <span class="sf-pin__type"></span>
      </div>
      <div class="sf-pin__zone"></div>
    </div>
  `;
  const nameEl = root.querySelector('.sf-pin__name');
  const statusEl = root.querySelector('.sf-pin__status');
  const typeEl = root.querySelector('.sf-pin__type');
  const zoneEl = root.querySelector('.sf-pin__zone');
  if (nameEl) nameEl.textContent = device.device_name || device.device_id;
  if (statusEl) statusEl.textContent = statusLabel(device);
  if (typeEl) typeEl.textContent = typeLabel(device);
  if (zoneEl) {
    zoneEl.textContent = zone;
    if (!zone) (zoneEl as HTMLElement).style.display = 'none';
  }

  root.addEventListener('click', (ev) => {
    ev.stopPropagation();
    onClick?.(device);
  });
  return root;
}

function syncHtmlMarkers(
  map: MapLibreMap,
  devices: DashboardMapDevice[],
  markers: Map<number, Marker>,
  keys: Map<number, string>,
  onClick: ((d: DashboardMapDevice) => void) | undefined,
  compact: boolean,
) {
  const valid = devices.filter(
    (d) => Number.isFinite(d.longitude) && Number.isFinite(d.latitude),
  );
  const nextIds = new Set(valid.map((d) => d.id));

  for (const [id, marker] of markers) {
    if (!nextIds.has(id)) {
      marker.remove();
      markers.delete(id);
      keys.delete(id);
    }
  }

  for (const device of valid) {
    const key = markerKey(device);
    let marker = markers.get(device.id);
    if (!marker) {
      const el = buildMarkerEl(device, onClick);
      marker = new Marker({ element: el, anchor: 'center' })
        .setLngLat([device.longitude, device.latitude])
        .addTo(map);
      markers.set(device.id, marker);
      keys.set(device.id, key);
    } else {
      marker.setLngLat([device.longitude, device.latitude]);
      if (keys.get(device.id) !== key) {
        const el = marker.getElement();
        const wasCompact = el.classList.contains('is-compact');
        const next = buildMarkerEl(device, onClick);
        el.className = next.className;
        if (wasCompact) el.classList.add('is-compact');
        el.dataset.deviceId = String(device.id);
        el.replaceChildren(...Array.from(next.childNodes));
        // rebind click: replaceChildren keeps old listener on root; rebuild listener
        el.onclick = (ev) => {
          ev.stopPropagation();
          onClick?.(device);
        };
        keys.set(device.id, key);
      }
    }
    marker.getElement().classList.toggle('is-compact', compact);
  }
}

function ensureOverlayLayers(map: MapLibreMap) {
  if (!map.getSource('sf-heat-src')) {
    map.addSource('sf-heat-src', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }
  if (!map.getSource('sf-fire-src')) {
    map.addSource('sf-fire-src', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }

  if (!map.getLayer('sf-heat')) {
    map.addLayer({
      id: 'sf-heat',
      type: 'heatmap',
      source: 'sf-heat-src',
      maxzoom: 14,
      paint: {
        'heatmap-weight': ['get', 'weight'],
        'heatmap-intensity': 1,
        'heatmap-radius': 28,
        'heatmap-opacity': 0.85,
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0,
          'rgba(0,0,0,0)',
          0.2,
          'rgba(59,130,246,0.45)',
          0.55,
          'rgba(245,158,11,0.65)',
          1,
          'rgba(239,68,68,0.95)',
        ],
      },
      layout: { visibility: 'none' },
    });
  }

  if (!map.getLayer('sf-fire-glow')) {
    map.addLayer({
      id: 'sf-fire-glow',
      type: 'circle',
      source: 'sf-fire-src',
      paint: {
        'circle-radius': 26,
        'circle-color': '#ef4444',
        'circle-opacity': 0.22,
        'circle-blur': 0.7,
      },
      layout: { visibility: 'none' },
    });
  }

  if (!map.getLayer('sf-fire-core')) {
    map.addLayer({
      id: 'sf-fire-core',
      type: 'circle',
      source: 'sf-fire-src',
      paint: {
        'circle-radius': 8,
        'circle-color': '#ef4444',
        'circle-opacity': 0.95,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fecaca',
      },
      layout: { visibility: 'none' },
    });
  }
}

function applyLayerVisibility(map: MapLibreMap, layer: SituationalMapLayer) {
  const setVis = (id: string, vis: 'visible' | 'none') => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
  };
  setVis('sf-heat', layer === 'thermal' ? 'visible' : 'none');
  setVis('sf-fire-glow', layer === 'fire' ? 'visible' : 'none');
  setVis('sf-fire-core', layer === 'fire' ? 'visible' : 'none');
}

export default function SituationalMap({
  devices,
  fireHighlights = [],
  layer = 'standard',
  loading = false,
  onDeviceClick,
  className,
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<number, Marker>>(new Map());
  const keysRef = useRef<Map<number, string>>(new Map());
  const devicesRef = useRef(devices);
  const onClickRef = useRef(onDeviceClick);
  const layerRef = useRef(layer);
  const fittedKeyRef = useRef('');
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const mapReadyRef = useRef(false);

  devicesRef.current = devices;
  onClickRef.current = onDeviceClick;
  layerRef.current = layer;

  const deviceGeo = useMemo(() => devicesToGeoJSON(devices), [devices]);
  const fireGeo = useMemo(() => firesToGeoJSON(fireHighlights), [fireHighlights]);
  const bounds = useMemo(
    () => computeBounds(devices, fireHighlights),
    [devices, fireHighlights],
  );
  const plottedCount = useMemo(
    () =>
      devices.filter((d) => Number.isFinite(d.longitude) && Number.isFinite(d.latitude))
        .length,
    [devices],
  );

  const refreshMarkers = (map: MapLibreMap) => {
    applyLayerVisibility(map, layerRef.current);
    if (layerRef.current !== 'standard') {
      clearMarkers(markersRef.current, keysRef.current);
      return;
    }
    syncHtmlMarkers(
      map,
      devicesRef.current,
      markersRef.current,
      keysRef.current,
      (d) => onClickRef.current?.(d),
      map.getZoom() < COMPACT_ZOOM,
    );
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    let cancelled = false;
    let map: MapLibreMap;

    try {
      map = new MapLibreMap({
        container,
        style: structuredClone(DARK_STYLE),
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
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
      kickResize();
      ensureOverlayLayers(map);
      (map.getSource('sf-heat-src') as GeoJSONSource | undefined)?.setData(deviceGeo);
      (map.getSource('sf-fire-src') as GeoJSONSource | undefined)?.setData(fireGeo);
      refreshMarkers(map);
      map.fitBounds(bounds, { padding: 48, maxZoom: 12, duration: 0 });
      fittedKeyRef.current = JSON.stringify(bounds);
      setMapReady(true);
      mapReadyRef.current = true;
      requestAnimationFrame(kickResize);
      window.setTimeout(kickResize, 100);
      window.setTimeout(() => {
        kickResize();
        refreshMarkers(map);
      }, 350);
    });

    map.on('zoom', () => {
      if (layerRef.current !== 'standard') return;
      const compact = map.getZoom() < COMPACT_ZOOM;
      for (const marker of markersRef.current.values()) {
        marker.getElement().classList.toggle('is-compact', compact);
      }
    });

    map.on('zoomend', () => refreshMarkers(map));

    map.on('error', (e) => {
      const msg = e.error?.message || '地图资源加载失败';
      if (!mapReadyRef.current && /style|worker|webgl/i.test(msg)) {
        setMapError(msg);
      }
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
      clearMarkers(markersRef.current, keysRef.current);
      map.remove();
      mapRef.current = null;
      mapReadyRef.current = false;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    ensureOverlayLayers(map);
    (map.getSource('sf-heat-src') as GeoJSONSource | undefined)?.setData(deviceGeo);
    (map.getSource('sf-fire-src') as GeoJSONSource | undefined)?.setData(fireGeo);
    refreshMarkers(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceGeo, fireGeo, devices]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    refreshMarkers(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const key = JSON.stringify(bounds);
    if (key === fittedKeyRef.current) return;
    fittedKeyRef.current = key;
    const run = () => {
      map.resize();
      map.fitBounds(bounds, { padding: 48, maxZoom: 12, duration: 700 });
      window.setTimeout(() => refreshMarkers(map), 50);
    };
    if (map.isStyleLoaded()) run();
    else map.once('load', run);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds]);

  return (
    <div
      ref={wrapRef}
      className={`relative h-full w-full min-h-[320px] ${className || ''}`}
      style={{ minHeight: 320 }}
    >
      <div ref={containerRef} className="absolute inset-0 sf-map-container" />

      {mapReady && layer === 'standard' && plottedCount > 0 && (
        <div className="pointer-events-none absolute left-3 top-3 z-20 rounded border border-[#1e3a5f]/80 bg-[#0c1a2e]/88 px-2.5 py-1.5 text-[10px] text-[#8b9bb4]">
          已标注 {plottedCount} 台 · 悬停看详情 · 点击打开设备
        </div>
      )}

      {!mapReady && !mapError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="rounded border border-[#1e3a5f] bg-[#0c1a2e]/85 px-3 py-2 text-xs text-[#8b9bb4]">
            地图初始化中…
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

      {mapReady && !loading && plottedCount === 0 && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="rounded border border-[#1e3a5f] bg-[#0c1a2e]/85 px-3 py-2 text-xs text-[#8b9bb4]">
            暂无带坐标的设备点位
          </div>
        </div>
      )}
    </div>
  );
}
