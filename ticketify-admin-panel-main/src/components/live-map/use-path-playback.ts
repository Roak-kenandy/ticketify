"use client";

import * as React from "react";
import { toLatLng, type LatLng, type LocationPoint } from "./types";

export type PlaybackSpeed = 1 | 2 | 4;

export function usePathPlayback(
  points: LocationPoint[] | undefined,
  panTo: (target: LatLng, zoom?: number) => void,
) {
  const path = React.useMemo(
    () =>
      (points ?? [])
        .map((point) => ({ point, coords: toLatLng(point) }))
        .filter((entry): entry is { point: LocationPoint; coords: LatLng } =>
          Boolean(entry.coords),
        ),
    [points],
  );

  const [active, setActive] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);
  const [index, setIndex] = React.useState(0);
  const [speed, setSpeed] = React.useState<PlaybackSpeed>(1);

  React.useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setIndex((current) => {
        if (current + 1 >= path.length) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 1000 / speed);
    return () => clearInterval(timer);
  }, [playing, speed, path.length]);

  React.useEffect(() => {
    if (!active) return;
    const target = path[index]?.coords;
    if (target) panTo(target);
  }, [active, index, path, panTo]);

  const play = React.useCallback(() => {
    if (!path.length) return;
    if (index >= path.length - 1) setIndex(0);
    if (!active) {
      const first = path[index >= path.length - 1 ? 0 : index]?.coords;
      if (first) panTo(first, 17);
    }
    setActive(true);
    setPlaying(true);
  }, [active, index, path, panTo]);

  const pause = React.useCallback(() => setPlaying(false), []);

  const stop = React.useCallback(() => {
    setPlaying(false);
    setActive(false);
    setIndex(0);
  }, []);

  const seek = React.useCallback(
    (next: number) => {
      if (next < 0 || next >= path.length) return;
      setActive(true);
      setIndex(next);
    },
    [path.length],
  );

  return {
    path,
    active,
    playing,
    index,
    speed,
    setSpeed,
    play,
    pause,
    stop,
    seek,
  };
}

export type PathPlayback = ReturnType<typeof usePathPlayback>;
