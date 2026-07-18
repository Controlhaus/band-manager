/** Shared app types that aren't Prisma models. */

export const EQUIPMENT_CATEGORIES = [
  "Instrument",
  "Amp",
  "PA",
  "Lighting",
  "Cables",
  "Other",
] as const;

export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];

export type EquipmentItem = {
  name: string;
  category: EquipmentCategory;
  notes?: string;
};

export const SONG_PLATFORMS = [
  "SPOTIFY",
  "YOUTUBE",
  "APPLE_MUSIC",
  "SOUNDCLOUD",
  "OTHER",
] as const;

export const SONG_STATUSES = [
  "IDEA",
  "REHEARSING",
  "REHEARSED",
  "PERFORMED",
  "RETIRED",
] as const;
