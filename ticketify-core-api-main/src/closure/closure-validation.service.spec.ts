import { ForbiddenException } from '@nestjs/common';
import { ClosureValidationService } from './closure-validation.service';
import { provisioningPolicy } from 'src/provisioning/provisioning-policy';

type Stock = {
  declaration: 'USED' | 'NONE_USED' | null;
  posted: {
    serialized: boolean;
    serial_number: string | null;
    quantity: number;
  }[];
};

function build(options: {
  category?: 'new_connections' | 'relocation' | 'fault' | null;
  stock?: Partial<Stock>;
  required?: { status: string | null; error?: string | null } | null;
  installed?: string[];
  inFlight?: string[];
  failedOptional?: string[];
  signal?: { required: boolean; captured: boolean };
  enforced?: string;
}) {
  const category = options.category ?? 'new_connections';
  const policy = provisioningPolicy(
    category,
    options.signal?.required ? category ?? '' : '',
  );
  const inventory = {
    closureState: jest
      .fn()
      .mockResolvedValue({ declaration: null, posted: [], ...options.stock }),
  };
  const provisioning = {
    closureState: jest.fn().mockResolvedValue({
      policy,
      required: policy.required_action
        ? {
            action: policy.required_action,
            status: options.required?.status ?? null,
            error: options.required?.error ?? null,
          }
        : null,
      signal: {
        required: policy.signal_required,
        captured: options.signal?.captured ?? false,
        result: null,
      },
      in_flight: options.inFlight ?? [],
      failed_optional: options.failedOptional ?? [],
      installed_serials: options.installed ?? [],
    }),
  };
  const snapshots = { get: jest.fn().mockResolvedValue({ category }) };
  const audit = { log: jest.fn().mockResolvedValue(true) };
  const config = {
    get: jest.fn((key: string) =>
      key === 'PHASE2_CLOSURE_ENFORCED' ? options.enforced : undefined,
    ),
  };
  const service = new ClosureValidationService(
    inventory as never,
    provisioning as never,
    snapshots as never,
    audit as never,
    config as never,
  );
  return { service, audit };
}

describe('ClosureValidationService', () => {
  it('blocks closure until inventory is declared', async () => {
    const { service } = build({ category: 'fault' });
    const result = await service.evaluate('sr-1');
    expect(result.ready).toBe(false);
    expect(
      result.checks.find((check) => check.key === 'inventory_declaration')?.ok,
    ).toBe(false);
    await expect(service.assertReadyToClose('sr-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('accepts an explicit "no inventory used" declaration', async () => {
    const { service } = build({
      category: 'fault',
      stock: { declaration: 'NONE_USED' },
    });
    expect((await service.evaluate('sr-1')).ready).toBe(true);
  });

  it('rejects "inventory used" when every line was reversed', async () => {
    const { service } = build({
      category: 'fault',
      stock: { declaration: 'USED', posted: [] },
    });
    expect((await service.evaluate('sr-1')).ready).toBe(false);
  });

  it('requires successful provisioning on new connections', async () => {
    const failed = build({
      stock: { declaration: 'NONE_USED' },
      required: { status: 'FAILED', error: 'INCA unavailable: timeout' },
    });
    const check = (await failed.service.evaluate('sr-1')).checks.find(
      (entry) => entry.key === 'provisioning',
    );
    expect(check?.ok).toBe(false);
    expect(check?.message).toMatch(/integration error/i);
  });

  it('requires the installed ONT serial to be posted with quantity 1', async () => {
    const missing = build({
      stock: {
        declaration: 'USED',
        posted: [{ serialized: false, serial_number: null, quantity: 12.5 }],
      },
      required: { status: 'SUCCEEDED' },
      installed: ['HWTC0001'],
    });
    expect((await missing.service.evaluate('sr-1')).ready).toBe(false);

    const matched = build({
      stock: {
        declaration: 'USED',
        posted: [{ serialized: true, serial_number: 'HWTC0001', quantity: 1 }],
      },
      required: { status: 'SUCCEEDED' },
      installed: ['HWTC0001'],
    });
    expect((await matched.service.evaluate('sr-1')).ready).toBe(true);
  });

  it('blocks while a run is in flight and only warns about failed optional actions', async () => {
    const running = build({
      category: 'fault',
      stock: { declaration: 'NONE_USED' },
      inFlight: ['SIGNAL_CHECK'],
    });
    expect((await running.service.evaluate('sr-1')).ready).toBe(false);

    const warned = build({
      category: 'fault',
      stock: { declaration: 'NONE_USED' },
      failedOptional: ['ONT_REPLACEMENT'],
    });
    const result = await warned.service.evaluate('sr-1');
    expect(result.ready).toBe(true);
    expect(
      result.checks.some((check) => check.severity === 'warn' && !check.ok),
    ).toBe(true);
  });

  it('requires a signal reading when configured for the category', async () => {
    const { service } = build({
      category: 'fault',
      stock: { declaration: 'NONE_USED' },
      signal: { required: true, captured: false },
    });
    expect(
      (await service.evaluate('sr-1')).checks.find(
        (check) => check.key === 'signal',
      )?.ok,
    ).toBe(false);
  });

  it('can be switched off for a staged rollout', async () => {
    const { service } = build({ category: 'fault', enforced: 'false' });
    await expect(service.assertReadyToClose('sr-1')).resolves.toBeNull();
  });
});
