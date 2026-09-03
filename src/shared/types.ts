export type OpenFileResult =
  | { canceled: true }
  | { canceled: false; filePath: string }

export type ReadFileResult =
  | { ok: true; content: string }
  | { ok: false; error: string }

export type ReadImageResult =
  | { ok: true; dataUrl: string }
  | { ok: false; error: string }

export type Theme = 'light' | 'dark' | 'sepia'

export interface Preferences {
  theme: Theme
  splitRatio: number
  recentFiles: string[]
}

export type SaveFileResult =
  | { canceled: true }
  | { canceled: false; filePath: string }
  | { canceled: false; filePath: ''; error: string }

export type WriteFileResult =
  | { ok: true }
  | { ok: false; error: string }

export type ExportFileResult =
  | { canceled: true }
  | { canceled: false; filePath: string }
  | { canceled: false; filePath: ''; error: string }

export interface MarkdownEditorApi {
  openFile: () => Promise<OpenFileResult>
  openRecentFile: (filePath: string) => Promise<OpenFileResult>
  readFile: (filePath: string) => Promise<ReadFileResult>
  readImage: (markdownPath: string, imagePath: string) => Promise<ReadImageResult>
  saveFile: (filePath: string, content: string) => Promise<WriteFileResult>
  saveFileAs: (suggestedName: string, content: string) => Promise<SaveFileResult>
  getPreferences: () => Promise<Preferences>
  setTheme: (theme: Theme) => Promise<void>
  setSplitRatio: (splitRatio: number) => Promise<void>
  updateWindowTitle: (filePath: string | null, isDirty: boolean) => Promise<void>
  exportHtml: (suggestedName: string, html: string) => Promise<ExportFileResult>
  exportPdf: (suggestedName: string, html: string) => Promise<ExportFileResult>
}
