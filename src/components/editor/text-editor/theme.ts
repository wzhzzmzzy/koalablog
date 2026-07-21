import { EditorView } from '@codemirror/view'

export const koalaEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'transparent',
    color: 'var(--koala-editor-text)',
    fontSize: '0.875rem',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'var(--koala-font-mono)',
    lineHeight: '1.6',
    touchAction: 'pan-x pan-y',
  },
  '.cm-content': {
    minHeight: '100%',
    padding: '0.5rem 0',
    caretColor: 'var(--koala-editor-text)',
  },
  '.cm-line': {
    padding: '0 0.5rem',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    borderRight: '1px solid var(--koala-border-subtle)',
    color: 'var(--koala-subtext-0)',
  },
  '.cm-activeLine, .cm-activeLineGutter': {
    backgroundColor: 'var(--koala-focusing-block)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--koala-editor-selection-bg) !important',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--koala-editor-text)',
  },
  '.cm-searchMatch': {
    backgroundColor: 'var(--koala-warning-bg)',
    outline: '1px solid var(--koala-warning-text)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'var(--koala-focusing-block)',
  },
  '@media (max-width: 640px)': {
    '.cm-gutters': {
      display: 'none',
    },
  },
})
