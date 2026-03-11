// ═══════════════════ CORE STATE ═══════════════════
export const state = {
  session: null,
  gridsData: [],
  activeGrid: null,
  sections: [],
  allCriteria: [],
  responses: {},
  currentIndex: 0,
  currentInspectionId: null,
};

export const isTauri = !!(window.__TAURI_INTERNALS__);
