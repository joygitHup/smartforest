/** 指挥中心 / 火情共用的中国范围深色底图配置 */
import type { StyleSpecification } from 'maplibre-gl';

export const CHINA_BOUNDS: [[number, number], [number, number]] = [
  [73.0, 17.8],
  [135.2, 53.7],
];

export const CHINA_MIN_ZOOM = 3.2;
export const CHINA_MAX_ZOOM = 16;
export const CHINA_DEFAULT_CENTER: [number, number] = [104.0, 35.5];
export const CHINA_DEFAULT_ZOOM = 3.8;

export const PLATFORM_DARK_STYLE: StyleSpecification = {
  version: 8,
  name: 'smartforest-platform-dark',
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    amap: {
      type: 'raster',
      tiles: [
        'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
        'https://webrd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
        'https://webrd03.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
        'https://webrd04.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
      ],
      tileSize: 256,
      attribution: '© 高德地图',
      maxzoom: 18,
      bounds: [CHINA_BOUNDS[0][0], CHINA_BOUNDS[0][1], CHINA_BOUNDS[1][0], CHINA_BOUNDS[1][1]],
    },
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#0a1628' },
    },
    {
      id: 'amap-dark',
      type: 'raster',
      source: 'amap',
      paint: {
        'raster-opacity': 0.88,
        'raster-saturation': -0.2,
        'raster-contrast': 0.06,
        'raster-brightness-min': 0.05,
        'raster-brightness-max': 0.85,
      },
    },
  ],
};
