import { contextBridge, ipcRenderer } from 'electron'
import type { MarkdownEditorApi } from '../shared/types'

const api: MarkdownEditorApi = {
  openFile: () => ipcRenderer.invoke('file:open'),
  openRecentFile: (filePath) => ipcRenderer.invoke('file:open-recent', filePath),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  readImage: (markdownPath, imagePath) => ipcRenderer.invoke('file:read-image', markdownPath, imagePath),
  saveFile: (filePath, content) => ipcRenderer.invoke('file:save', filePath, content),
  saveFileAs: (suggestedName, content) => ipcRenderer.invoke('file:save-as', suggestedName, content),
  getPreferences: () => ipcRenderer.invoke('settings:get'),
  setTheme: (theme) => ipcRenderer.invoke('settings:set-theme', theme),
  setSplitRatio: (splitRatio) => ipcRenderer.invoke('settings:set-split-ratio', splitRatio),
  updateWindowTitle: (filePath, isDirty) => ipcRenderer.invoke('window:update-title', filePath, isDirty),
  exportHtml: (suggestedName, html) => ipcRenderer.invoke('export:html', suggestedName, html),
  exportPdf: (suggestedName, html) => ipcRenderer.invoke('export:pdf', suggestedName, html)
}

contextBridge.exposeInMainWorld('markdownEditor', api)
