import type { MarkdownEditorApi } from '../shared/types'

declare global {
  interface Window {
    markdownEditor: MarkdownEditorApi
  }
}

export {}
