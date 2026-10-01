export type LocationPoint = {
  latitude: number | string;
  longitude: number | string;
  created_at: string;
};

export type Technician = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  presence?: string | null;
  availability?: boolean;
  busy_comment?: string | null;
  busy_until?: string | null;
  user_location_tracking?: LocationPoint[];
};

export type TechnicianTicket = {
  number?: string;
  title?: string;
  description?: string;
  state?: string;
  created_at?: string;
  contact?: { name?: string };
};

export type TechnicianFeedback = {
  rating: number;
  comment?: string;
  feedback?: string;
  customer_name?: string;
  created_at?: string;
};

export type TechnicianDetails = {
  user: Technician & { role?: { name?: string }; created_at?: string };
  ratings: {
    averageRating: number;
    totalFeedbacks: number;
    feedbacks?: TechnicianFeedback[];
  };
  serviceTickets: {
    total: number;
    new: number;
    in_progress: number;
    closed: number;
    tickets?: TechnicianTicket[];
  };
  locationTracking: {
    totalLocations: number;
    currentLocation?: LocationPoint | null;
    last8Hours?: LocationPoint[];
  };
};

export type RegionSummary = {
  label?: string;
  unassigned_new?: number;
  assigned_new?: number;
  in_progress?: number;
};

export type OperationsSnapshot = {
  regions?: {
    male?: RegionSummary;
    hulhumale?: RegionSummary;
    transport_lm?: RegionSummary;
  };
};

export type LatLng = { lat: number; lng: number };

export function toLatLng(point?: LocationPoint | null): LatLng | null {
  if (!point) return null;
  const lat = Number(point.latitude);
  const lng = Number(point.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export function technicianCoords(technician: Technician): LatLng | null {
  return toLatLng(technician.user_location_tracking?.[0]);
}
