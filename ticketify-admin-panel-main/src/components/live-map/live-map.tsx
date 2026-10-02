"use client";

import * as React from "react";
import GoogleMap from "google-maps-react-markers";
import moment from "moment";
import { useTheme } from "next-themes";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Crosshair, Info, Loader2, MapPinOff, Users, X } from "lucide-react";
import axios from "@/lib/axios-interceptor";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DARK_MAP_STYLES, LIGHT_MAP_STYLES } from "./map-styles";
import { TechnicianPanel, type PresenceFilter } from "./technician-panel";
import { TechnicianMarker, WaypointMarker } from "./technician-marker";
import { PlaybackControls, TechnicianDetailsPanel } from "./technician-details";
import { usePathPlayback } from "./use-path-playback";
import {
  technicianCoords,
  toLatLng,
  type LatLng,
  type Technician,
  type TechnicianDetails,
} from "./types";

const MAPS_API_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const DEFAULT_CENTER = { lat: 4.1752, lng: 73.5095 };
const DEFAULT_ZOOM = 13;
const FOCUS_ZOOM = 17;
const TECHNICIAN_POLL_MS = 10_000;
const DETAILS_POLL_MS = 15_000;
const MAP_OPTIONS = {
  disableDefaultUI: true,
  zoomControl: true,
  fullscreenControl: false,
  clickableIcons: false,
  gestureHandling: "greedy",
};

export function LiveMap() {
  const { resolvedTheme } = useTheme();

  const [technicians, setTechnicians] = React.useState<Technician[]>([]);
  const [techLoading, setTechLoading] = React.useState(true);
  const [techError, setTechError] = React.useState(false);

  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<PresenceFilter>("all");
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  const [panelOpen, setPanelOpen] = React.useState(false);

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [details, setDetails] = React.useState<TechnicianDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = React.useState(false);
  const [detailsError, setDetailsError] = React.useState(false);
  const [drawerHidden, setDrawerHidden] = React.useState(false);

  const mapRef = React.useRef<any>(null);
  const mapsRef = React.useRef<any>(null);
  const polylineRef = React.useRef<any>(null);
  const [mapReady, setMapReady] = React.useState(false);

  const fetchTechnicians = React.useCallback(async () => {
    try {
      const response = await axios.get<Technician[]>("/users/technicians");
      setTechnicians(Array.isArray(response.data) ? response.data : []);
      setTechError(false);
    } catch {
      setTechError(true);
    } finally {
      setTechLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchTechnicians();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") fetchTechnicians();
    }, TECHNICIAN_POLL_MS);
    return () => clearInterval(timer);
  }, [fetchTechnicians]);

  const detailsRequest = React.useRef(0);
  const loadDetails = React.useCallback(async (id: string, silent = false) => {
    const requestId = ++detailsRequest.current;
    if (!silent) {
      setDetailsLoading(true);
      setDetailsError(false);
    }
    try {
      const response = await axios.get<TechnicianDetails>(`/users/technician/${id}/details`);
      if (requestId !== detailsRequest.current) return;
      setDetails(response.data);
      setDetailsError(false);
    } catch {
      if (requestId !== detailsRequest.current) return;
      if (!silent) setDetailsError(true);
    } finally {
      if (requestId === detailsRequest.current && !silent) setDetailsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!selectedId) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") loadDetails(selectedId, true);
    }, DETAILS_POLL_MS);
    return () => clearInterval(timer);
  }, [selectedId, loadDetails]);

  const panTo = React.useCallback((target: LatLng, zoom?: number) => {
    const map = mapRef.current;
    if (!map) return;
    map.panTo(target);
    if (zoom) map.setZoom(zoom);
  }, []);

  const playback = usePathPlayback(details?.locationTracking?.last8Hours, panTo);
  const { stop: stopPlayback } = playback;

  const selectTechnician = React.useCallback(
    (technician: Technician) => {
      setPanelOpen(false);
      setDrawerHidden(false);
      const coords = technicianCoords(technician);
      if (coords) panTo(coords, FOCUS_ZOOM);
      if (technician.id === selectedId) return;
      stopPlayback();
      setDetails(null);
      setSelectedId(technician.id);
      loadDetails(technician.id);
    },
    [selectedId, loadDetails, panTo, stopPlayback],
  );

  const closeDetails = React.useCallback(() => {
    detailsRequest.current += 1;
    stopPlayback();
    setSelectedId(null);
    setDetails(null);
    setDetailsError(false);
    setDetailsLoading(false);
    setDrawerHidden(false);
  }, [stopPlayback]);

  const selectedTechnician = React.useMemo(
    () => technicians.find((technician) => technician.id === selectedId) ?? null,
    [technicians, selectedId],
  );

  const focusSelected = React.useCallback(() => {
    const coords =
      toLatLng(details?.locationTracking?.currentLocation) ??
      (selectedTechnician ? technicianCoords(selectedTechnician) : null);
    if (coords) panTo(coords, FOCUS_ZOOM);
  }, [details, selectedTechnician, panTo]);

  const startPlayback = React.useCallback(() => {
    setDrawerHidden(true);
    playback.play();
  }, [playback]);

  React.useEffect(() => {
    if (!mapReady) return;
    mapRef.current?.setOptions({
      styles: resolvedTheme === "dark" ? DARK_MAP_STYLES : LIGHT_MAP_STYLES,
    });
  }, [mapReady, resolvedTheme]);

  React.useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    polylineRef.current?.setMap(null);
    polylineRef.current = null;
    if (!mapReady || !maps || !map || !playback.active || playback.path.length < 2) return;
    polylineRef.current = new maps.Polyline({
      path: playback.path.map((entry) => entry.coords),
      strokeColor: resolvedTheme === "dark" ? "#4fa8f5" : "#003366",
      strokeOpacity: 0.75,
      strokeWeight: 4,
      geodesic: true,
      map,
    });
    return () => {
      polylineRef.current?.setMap(null);
      polylineRef.current = null;
    };
  }, [mapReady, playback.active, playback.path, resolvedTheme]);

  const onGoogleApiLoaded = React.useCallback(({ map, maps }: { map: any; maps: any }) => {
    mapRef.current = map;
    mapsRef.current = maps;
    setMapReady(true);
  }, []);

  const located = React.useMemo(
    () =>
      technicians
        .map((technician) => ({ technician, coords: technicianCoords(technician) }))
        .filter((entry): entry is { technician: Technician; coords: LatLng } =>
          Boolean(entry.coords),
        ),
    [technicians],
  );

  const fitAll = React.useCallback(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;
    if (!map || !maps || located.length === 0) {
      panTo(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }
    if (located.length === 1) {
      panTo(located[0].coords, FOCUS_ZOOM);
      return;
    }
    const bounds = new maps.LatLngBounds();
    located.forEach(({ coords }) => bounds.extend(coords));
    map.fitBounds(bounds, 64);
  }, [located, panTo]);

  const withoutLocation = technicians.length - located.length;
  const showDrawer = Boolean(selectedId) && !drawerHidden;

  const panelProps = {
    technicians,
    loading: techLoading,
    error: techError,
    onRetry: () => {
      setTechLoading(true);
      fetchTechnicians();
    },
    query,
    onQueryChange: setQuery,
    filter,
    onFilterChange: setFilter,
    selectedId,
    onSelect: selectTechnician,
    onHover: setHoveredId,
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="hidden w-[340px] shrink-0 border-r bg-card lg:block xl:w-[360px]">
        <TechnicianPanel {...panelProps} />
      </div>

      <DialogPrimitive.Root open={panelOpen} onOpenChange={setPanelOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-slate-950/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] flex-col rounded-t-2xl border-t bg-card shadow-elevated data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom lg:hidden">
            <DialogPrimitive.Title className="sr-only">Technicians</DialogPrimitive.Title>
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
            <DialogPrimitive.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2"
                aria-label="Close technician list"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogPrimitive.Close>
            <div className="min-h-0 flex-1">
              <TechnicianPanel {...panelProps} />
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className="relative min-w-0 flex-1 bg-muted">
        <GoogleMap
          apiKey={MAPS_API_KEY}
          defaultCenter={DEFAULT_CENTER}
          defaultZoom={DEFAULT_ZOOM}
          options={MAP_OPTIONS}
          mapMinHeight="100%"
          onGoogleApiLoaded={onGoogleApiLoaded}
          loadingContent={<MapStatus loading label="Loading map…" />}
          idleContent={<MapStatus loading label="Preparing map…" />}
          errorContent={
            <MapStatus label="The map couldn't load. Check the Google Maps API key and your connection." />
          }
        >
          {playback.active
            ? playback.path.map(({ point, coords }, index) => (
                <WaypointMarker
                  key={`${point.created_at}-${index}`}
                  lat={coords.lat}
                  lng={coords.lng}
                  active={index === playback.index}
                  passed={index < playback.index}
                  label={`Position at ${moment(point.created_at).format("h:mm A")}`}
                  onClick={() => playback.seek(index)}
                />
              ))
            : located.map(({ technician, coords }) => (
                <TechnicianMarker
                  key={technician.id}
                  lat={coords.lat}
                  lng={coords.lng}
                  technician={technician}
                  selected={technician.id === selectedId}
                  highlighted={technician.id === hoveredId}
                  onSelect={selectTechnician}
                />
              ))}
        </GoogleMap>

        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="pointer-events-auto shadow-card lg:hidden"
            onClick={() => setPanelOpen(true)}
          >
            <Users className="h-4 w-4" />
            Technicians
            <span className="tabular-nums text-muted-foreground">{technicians.length}</span>
          </Button>
          {!techLoading && withoutLocation > 0 && !playback.active && (
            <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-md border bg-card/95 px-2.5 py-1.5 text-xs text-muted-foreground shadow-card backdrop-blur">
              <MapPinOff className="h-3.5 w-3.5" />
              {withoutLocation} not sharing location
            </span>
          )}
        </div>

        {!playback.active && (
          <div
            className={cn(
              "absolute bottom-6 right-3 transition-[right]",
              showDrawer && "sm:right-[412px]",
            )}
          >
            <Button
              variant="outline"
              size="icon"
              onClick={fitAll}
              aria-label="Fit all technicians in view"
              title="Fit all technicians"
              className="shadow-card"
            >
              <Crosshair className="h-4 w-4" />
            </Button>
          </div>
        )}

        {playback.active && drawerHidden && (
          <div className="absolute inset-x-3 bottom-4 mx-auto max-w-md rounded-xl border bg-card/95 p-3 shadow-elevated backdrop-blur">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium">
                Route · {details?.user.name ?? selectedTechnician?.name}
              </p>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => setDrawerHidden(false)}>
                  <Info className="h-3.5 w-3.5" />
                  Details
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => {
                    stopPlayback();
                    setDrawerHidden(false);
                    focusSelected();
                  }}
                  aria-label="Exit route playback"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <PlaybackControls compact playback={playback} onStart={playback.play} />
          </div>
        )}

        {showDrawer && (
          <div className="absolute inset-0 z-20 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[400px]">
            <TechnicianDetailsPanel
              technician={selectedTechnician}
              details={details}
              loading={detailsLoading}
              error={detailsError}
              onRetry={() => selectedId && loadDetails(selectedId)}
              onClose={closeDetails}
              onFocusLocation={focusSelected}
              playback={playback}
              onStartPlayback={startPlayback}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function MapStatus({ label, loading }: { label: string; loading?: boolean }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted p-6">
      <div className="flex max-w-xs flex-col items-center gap-3 text-center text-sm text-muted-foreground">
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        ) : (
          <MapPinOff className="h-6 w-6" />
        )}
        {label}
      </div>
    </div>
  );
}
