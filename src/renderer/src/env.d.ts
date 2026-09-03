/// <reference types="vite/client" />

import type { MarkdownEditorApi } from '../../shared/types'

declare global {
  interface Window {
    markdownEditor: MarkdownEditorApi
  }
}

export {}

declare module '*.css?raw' {
  const content: string
  export default content
}
