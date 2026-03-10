import MarkdownIt from 'markdown-it';
import type { StateCore } from 'markdown-it/index.js';

// Lucide Icons
// Square (unchecked)
const UNCHECKED_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square task-list-icon"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>`;

// SquareCheck (checked)
const CHECKED_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-check task-list-icon"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/></svg>`;

export function useTodoPlugin(md: MarkdownIt) {
  md.core.ruler.push('todo_list', (state: StateCore) => {
    const tokens = state.tokens;
    for (let i = 2; i < tokens.length; i++) {
      if (tokens[i].type !== 'inline' || 
          tokens[i - 1].type !== 'paragraph_open' || 
          tokens[i - 2].type !== 'list_item_open') {
        continue;
      }

      const inlineToken = tokens[i];
      const children = inlineToken.children || [];
      const firstChild = children[0];

      if (!firstChild || firstChild.type !== 'text') {
        continue;
      }

      const content = firstChild.content;
      // Match "[ ] " or "[x] " or "[X] " at start
      const match = content.match(/^\[([ xX])\] /);

      if (match) {
        const isChecked = match[1] !== ' ';
        
        // Remove the "[ ] " or "[x] " text
        firstChild.content = content.slice(match[0].length);
        
        // Add class to list item
        tokens[i - 2].attrJoin('class', 'task-list-item');
        if (isChecked) {
            tokens[i - 2].attrJoin('class', 'checked');
        }

        // Insert SVG icon
        const iconToken = new state.Token('html_inline', '', 0);
        iconToken.content = `<span class="task-list-marker">${isChecked ? CHECKED_ICON : UNCHECKED_ICON}</span>`;
        
        // Add icon at the beginning of inline children
        inlineToken.children = [iconToken, ...children];
      }
    }
  });
}
