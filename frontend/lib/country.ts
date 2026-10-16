let names: Intl.DisplayNames | null | undefined;

/** Persian name of an ISO 3166-1 alpha-2 country code ("US" -> "ایالات متحده"); null when it isn't a known code. */
export function countryNameFa(code: string | null | undefined): string | null {
  const iso = code?.trim().toUpperCase();
  if (!iso || !/^[A-Z]{2}$/.test(iso)) return null;
  if (names === undefined) {
    try {
      names = new Intl.DisplayNames(["fa"], { type: "region" });
    } catch {
      names = null;
    }
  }
  try {
    const name = names?.of(iso);
    // Unassigned codes come back as the code itself or as the "unknown region" label.
    if (!name || name === iso || name === names?.of("ZZ")) return null;
    return name;
  } catch {
    return null;
  }
}
