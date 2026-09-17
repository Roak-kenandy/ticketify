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

export interface TechnicianDetailsDto {
  user: {
    id: string;
    crm_user_id: string;
    name: string;
    email: string;
    phone: string;
    availability: boolean;
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
  };
}
