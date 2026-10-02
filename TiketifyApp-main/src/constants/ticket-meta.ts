import colors from './colors';

export type Tone = {label: string; color: string; bg: string; icon: string};

/** Same palette as the admin panel: new = info, in progress = warning, closed = success. */
const STATE_META: Record<string, Tone> = {
  NEW: {
    label: 'Assigned',
    color: colors.info,
    bg: colors.infoBg,
    icon: 'mail-unread-outline',
  },
  IN_PROGRESS: {
    label: 'In progress',
    color: colors.warning,
    bg: colors.warningBg,
    icon: 'construct-outline',
  },
  CLOSED: {
    label: 'Completed',
    color: colors.success,
    bg: colors.successBg,
    icon: 'checkmark-done-outline',
  },
};

export function ticketStateMeta(state?: string): Tone {
  return (
    STATE_META[String(state ?? '').toUpperCase()] ?? {
      label: state ? humanize(state) : 'Unknown',
      color: colors.gray2,
      bg: colors.surface,
      icon: 'help-circle-outline',
    }
  );
}

const PRIORITY_META: Record<string, Tone> = {
  URGENT: {
    label: 'Urgent',
    color: colors.error,
    bg: colors.errorBg,
    icon: 'flame-outline',
  },
  CRITICAL: {
    label: 'Critical',
    color: colors.error,
    bg: colors.errorBg,
    icon: 'flame-outline',
  },
  HIGH: {
    label: 'High',
    color: colors.warning,
    bg: colors.warningBg,
    icon: 'arrow-up-outline',
  },
  MEDIUM: {
    label: 'Medium',
    color: '#B45309',
    bg: '#FEF3C7',
    icon: 'remove-outline',
  },
  NORMAL: {
    label: 'Normal',
    color: colors.info,
    bg: colors.infoBg,
    icon: 'remove-outline',
  },
  LOW: {
    label: 'Low',
    color: colors.gray2,
    bg: colors.surface,
    icon: 'arrow-down-outline',
  },
};

export function priorityMeta(priority?: string): Tone {
  return (
    PRIORITY_META[String(priority ?? '').toUpperCase()] ?? {
      label: priority ? humanize(priority) : 'Normal',
      color: colors.info,
      bg: colors.infoBg,
      icon: 'remove-outline',
    }
  );
}

export type Presence = 'ONLINE' | 'BUSY' | 'OFFLINE';

export const PRESENCE_META: Record<
  Presence,
  {label: string; description: string; color: string; bg: string; icon: string}
> = {
  ONLINE: {
    label: 'Available',
    description: 'Ready for new jobs',
    color: '#16A34A',
    bg: '#DCFCE7',
    icon: 'radio-button-on',
  },
  BUSY: {
    label: 'Busy',
    description: 'On a job, no new work',
    color: '#CA8A04',
    bg: '#FEF9C3',
    icon: 'time-outline',
  },
  OFFLINE: {
    label: 'Offline',
    description: 'Not working',
    color: '#DC2626',
    bg: '#FEE2E2',
    icon: 'moon-outline',
  },
};

export function presenceFromUser(user: any, isOnline: boolean): Presence {
  const p = user?.presence;
  if (p === 'ONLINE' || p === 'BUSY' || p === 'OFFLINE') {
    return p;
  }
  return isOnline ? 'ONLINE' : 'OFFLINE';
}

export function humanize(value: string): string {
  const text = String(value).replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function initials(name?: string): string {
  if (!name?.trim()) {
    return '?';
  }
  return name
    .trim()
    .split(/\s+/)
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
