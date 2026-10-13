import { IncaClient, IncaUnavailableError } from './inca.types';

/**
 * Used for any INCA_MODE without an adapter yet: every call reports INCA as
 * unavailable, so provisioning-required tickets stay blocked instead of
 * being closed against a fake backend.
 */
export class UnconfiguredIncaClient implements IncaClient {
  constructor(readonly mode: string) {}

  private fail(): Promise<never> {
    return Promise.reject(
      new IncaUnavailableError(`INCA adapter "${this.mode}" is not configured`),
    );
  }

  ping = () => this.fail();
  serviceAreas = () => this.fail();
  deviceTypes = () => this.fail();
  packages = () => this.fail();
  findSubscriber = () => this.fail();
  getSubscriber = () => this.fail();
  findDevice = () => this.fail();
  detectUnregistered = () => this.fail();
  registerOnt = () => this.fail();
  createSubscriber = () => this.fail();
  revokeOnu = () => this.fail();
  addOnu = () => this.fail();
  updateLocation = () => this.fail();
  listTodo = () => this.fail();
  getOpticalInfo = () => this.fail();
}
