/**
 * CSS variable bridge for Generative UI widgets.
 *
 * Sandbox iframes cannot inherit parent CSS variables, so we compute
 * the current theme values and inject them into the iframe's :root.
 * Widget code uses --widget-* variables that map to MyAgents design tokens.
 */

export function buildWidgetCssVars(): string {
  const style = getComputedStyle(document.documentElement);
  const get = (name: string) => style.getPropertyValue(name).trim();

  return `:root {
  --widget-text: ${get('--ink')};
  --widget-text-secondary: ${get('--ink-muted')};
  --widget-text-muted: ${get('--ink-subtle')};
  --widget-bg: ${get('--paper')};
  --widget-bg-elevated: ${get('--paper-elevated')};
  --widget-bg-inset: ${get('--paper-inset')};
  --widget-border: ${get('--line')};
  --widget-accent: ${get('--accent')};
  color-scheme: light;
}`;
}
