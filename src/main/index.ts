import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import type { OpenDialogOptions, Rectangle } from 'electron'
import Store from 'electron-store'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  ExportFileResult,
  OpenFileResult,
  Preferences,
  ReadFileResult,
  ReadImageResult,
  SaveFileResult,
  Theme,
  WriteFileResult
} from '../shared/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const selectedFiles = new Set<string>()
const defaultWindowBounds: Rectangle = { x: 0, y: 0, width: 1280, height: 820 }

interface SettingsSchema {
  theme: Theme
  splitRatio: number
  recentFiles: string[]
  windowBounds: Rectangle
}

let settingsStore: Store<SettingsSchema> | null = null
let mainWindow: BrowserWindow | null = null
let saveBoundsTimer: ReturnType<typeof setTimeout> | null = null

function getSettingsStore() {
  if (!settingsStore) {
    settingsStore = new Store<SettingsSchema>({
      name: 'settings',
      defaults: {
        theme: 'dark',
        splitRatio: 50,
        recentFiles: [],
        windowBounds: defaultWindowBounds
      }
    })
  }

  return settingsStore
}

function getWindowBounds(): Rectangle {
  const saved = getSettingsStore().get('windowBounds')
  const width = Number.isFinite(saved?.width) ? Math.max(860, saved.width) : defaultWindowBounds.width
  const height = Number.isFinite(saved?.height) ? Math.max(560, saved.height) : defaultWindowBounds.height

  return {
    x: Number.isFinite(saved?.x) ? saved.x : defaultWindowBounds.x,
    y: Number.isFinite(saved?.y) ? saved.y : defaultWindowBounds.y,
    width,
    height
  }
}

function persistWindowBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  getSettingsStore().set('windowBounds', mainWindow.getBounds())
}

function scheduleWindowBoundsSave() {
  if (saveBoundsTimer) clearTimeout(saveBoundsTimer)
  saveBoundsTimer = setTimeout(() => {
    saveBoundsTimer = null
    persistWindowBounds()
  }, 250)
}

function rememberRecentFile(filePath: string) {
  const store = getSettingsStore()
  const recentFiles = store.get('recentFiles').filter((item) => item !== filePath)
  store.set('recentFiles', [filePath, ...recentFiles].slice(0, 8))
}

function getPreferences(): Preferences {
  const store = getSettingsStore()
  return {
    theme: store.get('theme'),
    splitRatio: store.get('splitRatio'),
    recentFiles: store.get('recentFiles')
  }
}

function setWindowTitle(filePath: string | null, isDirty: boolean) {
  if (!mainWindow || mainWindow.isDestroyed()) return

  const fileName = filePath && selectedFiles.has(filePath) ? basename(filePath) : '未命名.md'
  mainWindow.setTitle(`${fileName}${isDirty ? ' ●' : ''} - Markdown Editor`)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    ...getWindowBounds(),
    minWidth: 860,
    minHeight: 560,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // electron-vite outputs an ESM preload file. Keep the renderer isolated
      // while allowing Electron to load this preload consistently in dev/build.
      sandbox: false
    }
  })

  setWindowTitle(null, false)
  mainWindow.on('resize', scheduleWindowBoundsSave)
  mainWindow.on('move', scheduleWindowBoundsSave)
  mainWindow.once('ready-to-show', () => mainWindow?.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

const markdownDialogOptions: OpenDialogOptions = {
  title: '打开 Markdown 文件',
  properties: ['openFile'],
  filters: [
    { name: 'Markdown 文件', extensions: ['md', 'markdown', 'mdown'] },
    { name: '所有文件', extensions: ['*'] }
  ]
}

async function openSelectedFile(filePath: string): Promise<OpenFileResult> {
  selectedFiles.add(filePath)
  rememberRecentFile(filePath)
  return { canceled: false, filePath }
}

ipcMain.handle('file:open', async (): Promise<OpenFileResult> => {
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, markdownDialogOptions)
    : await dialog.showOpenDialog(markdownDialogOptions)

  if (result.canceled || result.filePaths.length === 0) return { canceled: true }
  return openSelectedFile(result.filePaths[0])
})

ipcMain.handle('file:open-recent', async (_event, filePath: unknown): Promise<OpenFileResult> => {
  if (typeof filePath !== 'string' || !getSettingsStore().get('recentFiles').includes(filePath)) {
    return { canceled: true }
  }

  try {
    await readFile(filePath)
    return openSelectedFile(filePath)
  } catch {
    const store = getSettingsStore()
    store.set('recentFiles', store.get('recentFiles').filter((item) => item !== filePath))
    return { canceled: true }
  }
})

ipcMain.handle('file:read', async (_event, filePath: unknown): Promise<ReadFileResult> => {
  if (typeof filePath !== 'string' || !selectedFiles.has(filePath)) {
    return { ok: false, error: '只能读取通过文件选择框选中的文件。' }
  }

  try {
    return { ok: true, content: await readFile(filePath, 'utf8') }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '文件读取失败。' }
  }
})

ipcMain.handle('file:save', async (_event, filePath: unknown, content: unknown): Promise<WriteFileResult> => {
  if (typeof filePath !== 'string' || !selectedFiles.has(filePath) || typeof content !== 'string') {
    return { ok: false, error: '只能保存当前已打开的文件。' }
  }

  try {
    await writeFile(filePath, content, 'utf8')
    rememberRecentFile(filePath)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '文件保存失败。' }
  }
})

ipcMain.handle('file:save-as', async (_event, suggestedName: unknown, content: unknown): Promise<SaveFileResult> => {
  if (typeof content !== 'string') {
    return { canceled: false, filePath: '', error: '要保存的内容无效。' }
  }

  const defaultPath = typeof suggestedName === 'string' && suggestedName.trim() ? suggestedName : '未命名.md'
  const options: Electron.SaveDialogOptions = {
    title: '另存为 Markdown 文件',
    defaultPath,
    filters: markdownDialogOptions.filters
  }
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, options)
    : await dialog.showSaveDialog(options)

  if (result.canceled || !result.filePath) return { canceled: true }

  const filePath = extname(result.filePath) ? result.filePath : `${result.filePath}.md`
  try {
    await writeFile(filePath, content, 'utf8')
    selectedFiles.add(filePath)
    rememberRecentFile(filePath)
    return { canceled: false, filePath }
  } catch (error) {
    return { canceled: false, filePath: '', error: error instanceof Error ? error.message : '文件保存失败。' }
  }
})

ipcMain.handle('file:read-image', async (_event, markdownPath: unknown, imagePath: unknown): Promise<ReadImageResult> => {
  if (typeof markdownPath !== 'string' || !selectedFiles.has(markdownPath)) {
    return { ok: false, error: '图片只能从当前已打开的 Markdown 文件目录加载。' }
  }
  if (typeof imagePath !== 'string' || !imagePath.trim()) {
    return { ok: false, error: '图片路径为空。' }
  }

  try {
    const requestedPath = decodeURIComponent(imagePath.split(/[?#]/, 1)[0])
    if (isAbsolute(requestedPath)) return { ok: false, error: '不支持读取绝对路径图片。' }

    const imageFilePath = resolve(dirname(resolve(markdownPath)), requestedPath)
    const imageBuffer = await readFile(imageFilePath)
    const mimeTypes: Record<string, string> = {
      '.avif': 'image/avif',
      '.gif': 'image/gif',
      '.jpeg': 'image/jpeg',
      '.jpg': 'image/jpeg',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp'
    }
    const mimeType = mimeTypes[extname(imageFilePath).toLowerCase()] ?? 'application/octet-stream'
    return { ok: true, dataUrl: `data:${mimeType};base64,${imageBuffer.toString('base64')}` }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '图片读取失败。' }
  }
})

function exportFileName(suggestedName: unknown, extension: 'html' | 'pdf') {
  const fallback = `未命名.${extension}`
  if (typeof suggestedName !== 'string' || !suggestedName.trim()) return fallback

  const name = basename(suggestedName.trim())
    .replace(/\.(?:md|markdown|mdown|html|pdf)$/i, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .trim()
  return `${name || '未命名'}.${extension}`
}

function exportSaveOptions(title: string, suggestedName: unknown, extension: 'html' | 'pdf'): Electron.SaveDialogOptions {
  return {
    title,
    defaultPath: exportFileName(suggestedName, extension),
    filters: [{ name: extension === 'html' ? 'HTML 文件' : 'PDF 文件', extensions: [extension] }]
  }
}

ipcMain.handle('export:html', async (_event, suggestedName: unknown, html: unknown): Promise<ExportFileResult> => {
  if (typeof html !== 'string' || !html.trim()) {
    return { canceled: false, filePath: '', error: '没有可导出的预览内容。' }
  }

  const options = exportSaveOptions('导出 HTML 文件', suggestedName, 'html')
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return { canceled: true }

  try {
    await writeFile(result.filePath, html, 'utf8')
    return { canceled: false, filePath: result.filePath }
  } catch (error) {
    return { canceled: false, filePath: '', error: error instanceof Error ? error.message : 'HTML 导出失败。' }
  }
})

async function printHtmlToPdf(html: string) {
  const printWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 768,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    return await printWindow.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margins: { marginType: 'none' }
    })
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy()
  }
}

ipcMain.handle('export:pdf', async (_event, suggestedName: unknown, html: unknown): Promise<ExportFileResult> => {
  if (typeof html !== 'string' || !html.trim()) {
    return { canceled: false, filePath: '', error: '没有可导出的预览内容。' }
  }

  const options = exportSaveOptions('导出 PDF 文件', suggestedName, 'pdf')
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return { canceled: true }

  try {
    const pdfBuffer = await printHtmlToPdf(html)
    await writeFile(result.filePath, pdfBuffer)
    return { canceled: false, filePath: result.filePath }
  } catch (error) {
    return { canceled: false, filePath: '', error: error instanceof Error ? error.message : 'PDF 导出失败。' }
  }
})

ipcMain.handle('settings:get', (): Preferences => getPreferences())

ipcMain.handle('settings:set-theme', (_event, theme: unknown) => {
  if (theme === 'light' || theme === 'dark' || theme === 'sepia') {
    getSettingsStore().set('theme', theme)
  }
})

ipcMain.handle('settings:set-split-ratio', (_event, splitRatio: unknown) => {
  if (typeof splitRatio === 'number' && Number.isFinite(splitRatio)) {
    getSettingsStore().set('splitRatio', Math.min(78, Math.max(22, splitRatio)))
  }
})

ipcMain.handle('window:update-title', (_event, filePath: unknown, isDirty: unknown) => {
  setWindowTitle(typeof filePath === 'string' ? filePath : null, isDirty === true)
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', persistWindowBounds)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
