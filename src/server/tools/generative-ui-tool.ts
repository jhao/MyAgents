// Generative UI MCP Tool — AI generates interactive HTML widgets inline in chat
// Context-injected MCP server (same pattern as im-cron: always present for desktop sessions)
// Frontend renders widget_code in a sandboxed iframe with streaming preview

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod/v4';

// ===== Tool Description =====
// This is the most critical part — it controls when and how the AI generates widgets.
// Based on claude.ai's reverse-engineered Generative UI design guidelines.

const SHOW_WIDGET_DESCRIPTION = `Generate an interactive visualization widget that renders inline in the conversation.
Text goes in your response, visuals go in this tool. All explanatory text must be OUTSIDE this tool call.

## When to use — route on the verb, not the noun
- "Show me / visualize / chart / graph / plot" → use show_widget
- Data visualization: charts, graphs, trend lines, comparisons (Chart.js)
- Architecture/flow diagrams: system architecture, data flow, process flows (SVG)
- Interactive explainers: calculators, converters, sliders, live demos
- Structured displays: timelines, org charts, cards, dashboards
- Illustrative diagrams: visual metaphors, concept maps

## When NOT to use
- Simple text answers → regular text
- Code snippets → code blocks
- Static tables → Markdown tables
- "Show me the ERD / database schema" → Mermaid in code block
- Lists, bullet points → Markdown
- Content the user explicitly asks as text/code
- Deliverables the user wants to save/download → suggest writing a file instead

## Hard rules
- widget_code = self-contained HTML fragment. NO <!DOCTYPE>, <html>, <head>, <body>
- Streaming order: <style> (short, ≤15 lines) → content HTML → <script> last
- Prefer inline style="..." over <style> blocks when possible
- All colors MUST use CSS variables (auto light/dark):
  Text: var(--widget-text), var(--widget-text-secondary), var(--widget-text-muted)
  Background: var(--widget-bg), var(--widget-bg-elevated), var(--widget-bg-inset)
  Border: var(--widget-border)
  Accent: var(--widget-accent)
- 2 font weights only: 400 regular, 600 semibold. Never 700.
- No gradients, drop shadows, blur, glow (they flash during streaming DOM diffs)
- No HTML comments, CSS comments (waste tokens)
- No font-size below 11px. No emoji — use CSS shapes or SVG paths
- No position:fixed (iframe viewport sizes to content height)
- No tabs/carousels/display:none (broken during streaming)
- Responsive: percentage widths, viewBox for SVG. Min width 300px.
- Colors encode meaning, not sequence. Max 2-3 color ramps per widget.
- Match the conversation language for all text content.

## CDN libraries (CSP-enforced allowlist)
- Chart.js: https://cdn.jsdelivr.net/npm/chart.js
- D3.js: https://cdn.jsdelivr.net/npm/d3@7
- Mermaid: https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js
- Lucide Icons: https://unpkg.com/lucide@latest
- Any package from: cdn.jsdelivr.net, cdnjs.cloudflare.com, unpkg.com, esm.sh

## Structure template
<style>
  .widget { font-family: system-ui, sans-serif; color: var(--widget-text); padding: 16px; }
</style>
<div class="widget">
  <!-- SVG, canvas, or HTML content -->
</div>
<script>
  // Runs after streaming completes. Use requestAnimationFrame for animations.
</script>`;

// ===== MCP Server =====

export function createGenerativeUiServer() {
  return createSdkMcpServer({
    name: 'generative-ui',
    version: '1.0.0',
    tools: [
      tool(
        'show_widget',
        SHOW_WIDGET_DESCRIPTION,
        {
          title: z.string().describe(
            'Widget identifier in snake_case format. Used for logging and debugging.'
          ),
          widget_code: z.string().describe(
            'Self-contained HTML fragment. Contains <style>, HTML content, and <script> (in that order). ' +
            'No <html>/<head>/<body> tags. ' +
            'Use CDN libraries: Chart.js, D3.js, Mermaid, Lucide Icons. ' +
            'All styles must use CSS variables for theme compatibility.'
          ),
        },
        async (args) => {
          // Handler is a no-op — rendering happens entirely in the frontend.
          // The tool result confirms success so the AI knows the widget was displayed.
          return {
            content: [{ type: 'text', text: `Widget "${args.title}" rendered successfully.` }],
          };
        }
      ),
    ],
  });
}

export const generativeUiServer = createGenerativeUiServer();
