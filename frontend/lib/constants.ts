// entity_type -> Persian label + accent color, shared by any UI that needs
// to badge/tint an entity by its type (ListCard's per-type count badges,
// EntityCard type chips, etc). Kept here as a single source of truth so
// the mapping stays consistent across components.
export const ENTITY_TYPE_LABELS: Record<string, string> = {
  movie: "فیلم",
  tv_series: "سریال",
  track: "موسیقی",
  album: "آلبوم",
  person: "شخصیت",
  genre: "ژانر",
  country: "کشور",
};

export type EntityTypeColor = "gold" | "violet" | "teal" | "muted";

export const ENTITY_TYPE_COLORS: Record<string, EntityTypeColor> = {
  movie: "gold",
  tv_series: "violet",
  track: "teal",
  album: "teal",
  person: "muted",
  genre: "muted",
};

export const ENTITY_TYPE_BADGE_CLASSES: Record<EntityTypeColor, string> = {
  gold: "text-gold border-gold/30 bg-gold/10",
  violet: "text-violet border-violet/30 bg-violet/10",
  teal: "text-teal border-teal/30 bg-teal/10",
  muted: "text-muted border-border bg-surface2",
};

export function entityTypeLabel(entityType: string): string {
  return ENTITY_TYPE_LABELS[entityType] ?? entityType;
}

export function entityTypeBadgeClass(entityType: string): string {
  const color = ENTITY_TYPE_COLORS[entityType] ?? "muted";
  return ENTITY_TYPE_BADGE_CLASSES[color];
}
