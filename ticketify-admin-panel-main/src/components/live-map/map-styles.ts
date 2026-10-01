export const DARK_MAP_STYLES: object[] = [
  {
    stylers: [
      { hue: "#ff1a00" },
      { invert_lightness: true },
      { saturation: -100 },
      { lightness: 33 },
      { gamma: 0.5 },
    ],
  },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#2D333C" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

export const LIGHT_MAP_STYLES: object[] = [
  { elementType: "geometry", stylers: [{ color: "#f3f5f8" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#5b6576" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f3f5f8" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "labels.text.fill", stylers: [{ color: "#7a8494" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#e6eaf0" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#cfe3f3" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#7c95ab" }] },
];
