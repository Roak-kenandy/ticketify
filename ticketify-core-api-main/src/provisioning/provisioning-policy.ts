import { ProvisioningAction } from '@prisma/client';
import { AutoAssignCategory } from 'src/assignment/assignment-settings.service';
import { IncaOpticalInfo } from 'src/infrastructure/inca/inca.types';

export type OpticalRange = { min_dbm: number; max_dbm: number };

export type SignalResult = 'WITHIN_RANGE' | 'OUTSIDE_RANGE' | 'NO_READING';

export type ProvisioningPolicy = {
  /** Every action, recommended ones first, in the order the app shows them. */
  actions: ProvisioningAction[];
  /** Actions that match this Service Request type. */
  recommended: ProvisioningAction[];
  /** Action whose latest run must have succeeded before closure, if any. */
  required_action: ProvisioningAction | null;
  signal_required: boolean;
};

const ALL_ACTIONS: ProvisioningAction[] = [
  'NEW_CONNECTION',
  'ONT_REPLACEMENT',
  'RELOCATION',
  'SIGNAL_CHECK',
];

const RECOMMENDED_BY_CATEGORY: Record<
  AutoAssignCategory,
  ProvisioningAction[]
> = {
  new_connections: ['NEW_CONNECTION', 'SIGNAL_CHECK'],
  relocation: ['RELOCATION'],
  fault: ['ONT_REPLACEMENT'],
};

/** Categories limited to these actions; every other category offers all of them. */
const ONLY_BY_CATEGORY: Partial<
  Record<AutoAssignCategory, ProvisioningAction[]>
> = {
  fault: ['ONT_REPLACEMENT'],
  relocation: ['RELOCATION'],
};

const REQUIRED_BY_CATEGORY: Partial<
  Record<AutoAssignCategory, ProvisioningAction>
> = {
  new_connections: 'NEW_CONNECTION',
  relocation: 'RELOCATION',
};

/**
 * @param signalRequiredFor categories (comma list from config) whose closure
 * needs a captured signal-check result.
 */
export function provisioningPolicy(
  category: AutoAssignCategory | null,
  signalRequiredFor: string,
): ProvisioningPolicy {
  const required = new Set(
    signalRequiredFor
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
  const recommended: ProvisioningAction[] = category
    ? RECOMMENDED_BY_CATEGORY[category]
    : ['SIGNAL_CHECK', 'ONT_REPLACEMENT'];
  const actions = (category && ONLY_BY_CATEGORY[category]) || [
    ...recommended,
    ...ALL_ACTIONS.filter((action) => !recommended.includes(action)),
  ];
  return {
    actions,
    recommended,
    required_action: category ? REQUIRED_BY_CATEGORY[category] ?? null : null,
    // A signal check that is not offered can never be demanded at closure.
    signal_required: Boolean(
      category && required.has(category) && actions.includes('SIGNAL_CHECK'),
    ),
  };
}

export function classifySignal(
  reading: IncaOpticalInfo | null,
  range: OpticalRange,
): SignalResult {
  if (!reading || reading.rx_dbm === null || !Number.isFinite(reading.rx_dbm)) {
    return 'NO_READING';
  }
  return reading.rx_dbm >= range.min_dbm && reading.rx_dbm <= range.max_dbm
    ? 'WITHIN_RANGE'
    : 'OUTSIDE_RANGE';
}

export const ACTION_LABELS: Record<ProvisioningAction, string> = {
  NEW_CONNECTION: 'New connection',
  ONT_REPLACEMENT: 'ONT replacement',
  RELOCATION: 'Relocation',
  SIGNAL_CHECK: 'Signal check',
};
