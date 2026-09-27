export function parseGstRate(raw: string | undefined): number {
  const n = Number(raw ?? '0.08');
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    return 0.08;
  }
  return n;
}

/** GST included in total: tax = total - total/(1+rate) */
export function splitTaxFromTotal(totalMvr: number, gstRate: number) {
  const total = Math.round(totalMvr * 100) / 100;
  const subtotal =
    Math.round((total / (1 + gstRate)) * 100) / 100;
  const tax = Math.round((total - subtotal) * 100) / 100;
  return { subtotal, tax, total };
}

export function addTaxToSubtotal(subtotalMvr: number, gstRate: number) {
  const subtotal = Math.round(subtotalMvr * 100) / 100;
  const tax = Math.round(subtotal * gstRate * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  return { subtotal, tax, total };
}
