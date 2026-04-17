"use client";

import { useMemo } from "react";
import Map, { Source, Layer, Marker } from "react-map-gl/mapbox";
import type { LayerProps } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";

interface RouteMapProps {
  latlng: [number, number][];
  className?: string;
}

function useResolvedColor(cssVar: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim() || fallback;
}


export function RouteMap({ latlng, className }: RouteMapProps) {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const brandColor = useResolvedColor("--color-brand", "#f23b94");

  const routeLayer: LayerProps = {
    id: "route",
    type: "line",
    paint: {
      "line-color": brandColor,
      "line-width": 3,
      "line-opacity": 1,
    },
  };

  const bounds = useMemo(() => {
    if (latlng.length === 0) {
      return null;
    }

    let minLat = latlng[0][0];
    let maxLat = latlng[0][0];
    let minLng = latlng[0][1];
    let maxLng = latlng[0][1];

    for (const [lat, lng] of latlng) {
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
    }

    // Add padding to bounds
    const latPadding = (maxLat - minLat) * 0.15;
    const lngPadding = (maxLng - minLng) * 0.15;

    return [
      [minLng - lngPadding, minLat - latPadding],
      [maxLng + lngPadding, maxLat + latPadding],
    ] as [[number, number], [number, number]];
  }, [latlng]);

  const geojson = useMemo(
    () => ({
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: latlng.map(([lat, lng]) => [lng, lat]), // GeoJSON uses [lng, lat]
      },
      properties: {},
    }),
    [latlng]
  );

  const startPoint = latlng.length > 0 ? latlng[0] : null;
  const endPoint = latlng.length > 1 ? latlng[latlng.length - 1] : null;

  if (!mapboxToken) {
    return (
      <div className={`bg-surface-alt rounded-lg flex items-center justify-center text-muted text-sm ${className}`}>
        Map unavailable (no API key)
      </div>
    );
  }

  if (latlng.length === 0) {
    return null;
  }

  return (
    <div className={`rounded-lg overflow-hidden ${className}`}>
      <Map
        initialViewState={{
          bounds: bounds ?? undefined,
          fitBoundsOptions: { padding: 50 },
        }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/outdoors-v12"
        mapboxAccessToken={mapboxToken}
        scrollZoom={true}
        dragPan={true}
        dragRotate={false}
        touchZoomRotate={true}
        doubleClickZoom={true}
        logoPosition="bottom-right"
        attributionControl={false}
      >
        <Source id="route" type="geojson" data={geojson}>
          <Layer {...routeLayer} />
        </Source>

        {/* Start marker - green */}
        {startPoint && (
          <Marker longitude={startPoint[1]} latitude={startPoint[0]} anchor="center">
            <div className="w-4 h-4 bg-green-500 rounded-full border-2 border-white shadow-lg" />
          </Marker>
        )}

        {/* End marker - pink */}
        {endPoint && (
          <Marker longitude={endPoint[1]} latitude={endPoint[0]} anchor="center">
            <div className="w-4 h-4 bg-brand rounded-full border-2 border-white shadow-lg" />
          </Marker>
        )}
      </Map>
    </div>
  );
}
