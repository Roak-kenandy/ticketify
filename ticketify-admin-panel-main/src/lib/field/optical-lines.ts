const SHOWN = [
  "ont tx optical power",
  "ont rx optical power",
  "catv rx optical power",
  "ont voltage",
  "ont laser bias current",
];

/** The signal screen keeps these optical lines and drops the rest (OLT Rx, temperature, …). */
export function shownOpticalLines(
  details?: Array<{ label: string; value: string }> | null,
) {
  return (details ?? []).filter((line) =>
    SHOWN.some((prefix) => line.label.toLowerCase().startsWith(prefix)),
  );
}
