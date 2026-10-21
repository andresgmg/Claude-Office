/**
 * Typed view of `window.__claudeOfficeTestHooks`, the observability surface the
 * SPA installs when a page is flagged as the e2e harness (`__CLAUDE_OFFICE_E2E`,
 * set by e2e/helpers/standalone.ts before navigation; the installer lives in
 * webview-ui/src/testHooks.ts). Layout-editor state — areas, area tiles,
 * carpet tiles, seats — renders only on the canvas, so specs read it through
 * these hooks from inside `page.evaluate`. The two tile-action hooks call the
 * same App-level handlers the canvas calls, bypassing only pixel→tile geometry.
 *
 * Declared here rather than imported from webview-ui so the e2e tsconfig stays
 * self-contained.
 */
export interface TestHooksWindow extends Window {
  __claudeOfficeTestHooks?: {
    getCarpetTiles?: () => Array<{
      col: number;
      row: number;
      variant: number;
      color?: unknown;
      accentColor?: unknown;
      order?: number;
    }>;
    getCarpetJunctionCase?: (jx: number, jy: number, variant: number) => number;
    getAreas?: () => Array<{ label: string; color: string }>;
    getAreaTiles?: () => Array<{ col: number; row: number; label: string }>;
    getAreaMappings?: () => Record<string, string[]>;
    getShowAreas?: () => boolean;
    getAgentSeats?: () => Array<{
      id: number;
      seatId: string | null;
      areaLabel: string | null;
      folderName?: string;
    }>;
    getSeats?: () => Array<{
      uid: string;
      col: number;
      row: number;
      areaLabel: string | null;
      assigned: boolean;
    }>;
    editorTileAction?: (col: number, row: number) => void;
    editorEraseAction?: (col: number, row: number) => void;
    /** Select a character by agent id, the same state a canvas click sets. */
    selectAgent?: (id: number) => void;
    messageLog?: Array<{ type: string }>;
  };
}
