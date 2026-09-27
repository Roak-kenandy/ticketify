type Listener = (active: boolean, count: number) => void;

let inFlight = 0;
const listeners = new Set<Listener>();

export function subscribeApiLoading(listener: Listener): () => void {
  listeners.add(listener);
  listener(inFlight > 0, inFlight);
  return () => listeners.delete(listener);
}

function notify() {
  const active = inFlight > 0;
  listeners.forEach(l => l(active, inFlight));
}

export function trackApiLoading<T>(promise: Promise<T>): Promise<T> {
  inFlight += 1;
  notify();
  return promise.finally(() => {
    inFlight = Math.max(0, inFlight - 1);
    notify();
  });
}
