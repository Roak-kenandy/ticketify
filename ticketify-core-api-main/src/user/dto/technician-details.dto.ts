export interface TechnicianFeedback {
  id: string;
  rating: number;
  feedback: string;
  ticket_id: string;
  created_at: Date;
}

export interface TechnicianTicket {
  id: string;
  crm_id: string;
  number: string;
  description: string;
  state: string;
  contact_id: string;
  priority: string;
  created_at: Date;
}

export interface TechnicianLocationTracking {
  id: string;
  latitude: number;
  longitude: number;
  created_at: Date;
}

/** Traccar Client state shown to dispatch. Never includes the device id (it is a credential). */
export const TRACKING_STATE_SELECT = {
  last_seen_at: true,
  is_moving: true,
  motion_since: true,
  battery_level: true,
  is_charging: true,
} as const;

export interface TrackingState {
  last_seen_at: Date | null;
  is_moving: boolean | null;
  motion_since: Date | null;
  battery_level: number | null;
  is_charging: boolean | null;
}

export interface TechnicianDetailsDto {
  user: {
    id: string;
    crm_user_id: string;
    name: string;
    email: string;
    phone: string;
    availability: boolean;
    presence?: "ONLINE" | "BUSY" | "OFFLINE";
    busy_comment?: string | null;
    busy_until?: Date | string | null;
    created_at: Date;
    role: {
      name: string;
    };
  };
  serviceTickets: {
    total: number;
    new: number;
    in_progress: number;
    closed: number;
    tickets: TechnicianTicket[];
  };
  ratings: {
    totalRating: number;
    averageRating: number;
    totalFeedbacks: number;
    feedbacks: TechnicianFeedback[];
  };
  locationTracking: {
    totalLocations: number;
    last8Hours: TechnicianLocationTracking[];
    currentLocation?: TechnicianLocationTracking;
    /** Traccar Client state; null when the technician has not set it up. */
    device?: TrackingState | null;
  };
}
