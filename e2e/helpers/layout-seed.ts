/**
 * Builder for a minimal `layout.json` document. The standalone UI spec writes
 * one to disk and feeds it to the browser's "Import Layout" file input, then
 * recognises it in the applied OfficeState by its unique area label.
 *
 * The layout carries a layoutRevision far above the bundled default's: the
 * webview runs its legacy-format migrations only when the revision is missing
 * (webview-ui/src/office/layout/layoutSerializer.ts), so a high revision keeps
 * a seeded layout out of that path and out of any future revision-based reset.
 */

/** Far above the bundled default-layout revision so a seeded layout survives load. */
const SEED_LAYOUT_REVISION = 9999;

/** Default floor TileType used to fill a seeded grid (FLOOR_1 = 1). */
const FLOOR_1 = 1;

export interface SeedAreaTile {
  col: number;
  row: number;
  label: string;
}

export interface SeedCarpetTile {
  col: number;
  row: number;
  variant: number;
}

export interface SeedLayoutOptions {
  cols?: number;
  rows?: number;
  /** TileType value to fill every tile with (default FLOOR_1). */
  floorTile?: number;
  areas?: Array<{ label: string; color: string }>;
  /** Sparse area-tile labels; expanded to a full parallel array. */
  areaTiles?: SeedAreaTile[];
  /** Sparse carpet tiles; expanded to a full parallel array (default colors). */
  carpetTiles?: SeedCarpetTile[];
}

/**
 * Build a minimal valid OfficeLayout (version 1, all-floor, no furniture) with
 * optional carpet/area data. No chairs means no seats — a test that needs
 * seated characters must use the bundled default layout instead.
 */
export function buildSeedLayout(opts: SeedLayoutOptions = {}): Record<string, unknown> {
  const cols = opts.cols ?? 12;
  const rows = opts.rows ?? 12;
  const count = cols * rows;
  const tiles = new Array<number>(count).fill(opts.floorTile ?? FLOOR_1);

  const layout: Record<string, unknown> = {
    version: 1,
    cols,
    rows,
    tiles,
    furniture: [],
    layoutRevision: SEED_LAYOUT_REVISION,
  };

  if (opts.areas) {
    layout.areas = opts.areas;
  }
  if (opts.areaTiles) {
    const areaTiles = new Array<string | null>(count).fill(null);
    for (const t of opts.areaTiles) {
      areaTiles[t.row * cols + t.col] = t.label;
    }
    layout.areaTiles = areaTiles;
  }
  if (opts.carpetTiles) {
    const carpetTiles = new Array<{ variant: number } | null>(count).fill(null);
    for (const t of opts.carpetTiles) {
      carpetTiles[t.row * cols + t.col] = { variant: t.variant };
    }
    layout.carpetTiles = carpetTiles;
  }

  return layout;
}
