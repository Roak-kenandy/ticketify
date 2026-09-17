// create a service request type
export type ServiceRequest = {
  tags: any;
  comments: any[];
  stage: {
    order: number;
    id: string;
    name: string;
    colour: string;
  };
  links: any[];
  categories: any[];
  invoices: any[];
  approvals: {
    state: string;
    type: string;
  }[];
  state: string;
  id: string;
  assigned_to: {
    team: string;
    user: {
      username: string;
      name: string;
      id: string;
    };
  };
  number: string;
  description: string;
  is_resolved: boolean;
  close_date: number;
  queue: {
    id: string;
    name: string;
  };
  contact: {
    id: string;
    name: string;
    code: string;
    phone: {
      number: string;
    };
    person_name: {
      full_name: string;
    };
    addresses: {
      address_line_1: string;
      address_line_2: string;
      town_city: string;
      country_code: string;
    }[];
    services: {
      content: any[];
    };
  };
  affected_entities: {
    id: string;
    type: string;
    value: string;
  }[];
  custom_fields: any[];
  creation_date: number;
  alert_date: number;
  approximate_close_date: number;
  priority_matrix: {
    urgency: string;
    impact: string;
    priority: string;
  };
  closure_reason: string;
  address: string;
  notes: {
    paging: {
      page: number;
      size: number;
      total: number;
      has_more: boolean;
    };
    content: [
      {
        pinned: boolean;
        note: string;
        id: string;
        created_on: number;
        updated_on: number;
        created_by: {
          username: string;
          name: string;
          id: string;
        };
      },
    ];
  };
  queue_info: any;
  attachments: {
    paging: {
      page: number;
      size: number;
      total: number;
      has_more: boolean;
    };
    content: [
      {
        file: {
          id: string;
          name: string;
          mime: string;
        };
        description: string;
        link: string;
        id: string;
        file_url: string;
      },
    ];
  };
  activities: {
    content: {
      type: {
        name: string;
        colour: string;
        id: string;
      };
      owner: {
        id: string;
        name: string;
      };
      id: string;
      name: string;
      activity_date: {
        date: number;
        from_time: string;
        to_time: string;
      };
    }[];
  };
};
