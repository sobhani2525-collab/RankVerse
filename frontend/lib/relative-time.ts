// Native Intl-based Persian relative time ("۲ روز پیش" -> rendered with
// Latin digits, matching the rest of the app's numeric convention -- see
// the .num utility in globals.css). No date library dependency needed.
const RTF = new Intl.RelativeTimeFormat("fa-IR-u-nu-latn", { numeric: "auto" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
];

export function relativeTimeFa(iso: string): string {
  const diffSeconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);

  for (const [unit, secondsInUnit] of UNITS) {
    if (Math.abs(diffSeconds) >= secondsInUnit) {
      return RTF.format(Math.round(diffSeconds / secondsInUnit), unit);
    }
  }
  return RTF.format(diffSeconds, "second");
}
