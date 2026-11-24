export const initialPanelSelection = Object.freeze({ known: [], selected: null, previous: null });

export function nextPanelSelection(state, panels, requested = null) {
  if (panels.length === 0) return initialPanelSelection;

  const opened = panels.filter((panel) => !state.known.includes(panel));
  const alive = (panel) => (panels.includes(panel) ? panel : null);
  let selected = alive(state.selected);
  let previous = alive(state.previous);

  if (requested && panels.includes(requested)) selected = requested;
  else if (opened.length > 0 && state.known.length > 0) selected = opened[0];
  else if (!selected) selected = previous || panels[0];

  if (selected !== state.selected) previous = alive(state.selected);
  if (!selected || previous === selected) previous = null;

  return { known: panels, selected, previous };
}
