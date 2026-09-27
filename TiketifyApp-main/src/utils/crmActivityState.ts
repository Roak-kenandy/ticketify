const LM_TYPE_NAMES = ['Last Mile Cabling'];

/** Current CRM activity state (list uses `state`; detail uses `states[]` newest-first). */
export function resolveCrmActivityState(activity: any): string {
  if (typeof activity?.state === 'string' && activity.state.length > 0) {
    return activity.state;
  }
  const states = activity?.states;
  if (!Array.isArray(states) || states.length === 0) {
    return 'UNKNOWN';
  }
  const latest = [...states].sort(
    (a, b) => (b.date ?? 0) - (a.date ?? 0),
  )[0];
  return latest?.state ?? 'UNKNOWN';
}

export function isLastMileActivity(activity: any): boolean {
  const name = activity?.type?.name;
  return LM_TYPE_NAMES.includes(name);
}

export function hasPendingLastMile(activities: any[] | undefined): boolean {
  return (activities ?? []).some(
    (a) =>
      isLastMileActivity(a) && resolveCrmActivityState(a) === 'PENDING',
  );
}

const NO_RESPONSE_TYPE_NAMES = ['No Response'];

export function isNoResponseActivity(activity: any): boolean {
  const name = activity?.type?.name;
  return NO_RESPONSE_TYPE_NAMES.includes(name);
}

export function hasPendingNoResponse(activities: any[] | undefined): boolean {
  return (activities ?? []).some(
    (a) =>
      isNoResponseActivity(a) && resolveCrmActivityState(a) === 'PENDING',
  );
}

export function lmStatusLabel(state: string): string {
  if (state === 'COMPLETED') {
    return 'Completed';
  }
  if (state === 'PENDING') {
    return 'Pending';
  }
  return state;
}
