import { useEffect, useRef, useState } from 'react'
import type { ImgHTMLAttributes, PointerEvent as ReactPointerEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import type { OpenFileResult, Theme } from '../../shared/types'
import exportStyles from './exportStyles.css?raw'

const starterMarkdown = `# Markdown 编辑器

点击左上角的「打开」按钮，选择一个 Markdown 文件开始编辑。

## 当前能力

- 左侧编辑 Markdown 文本
- 右侧实时预览
- 拖动中间分隔条调整比例
`

type CodeTheme = 'dark' | 'light'

type MarkdownImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  markdownPath: string | null
}

function MarkdownImage({ markdownPath, src, alt, ...props }: MarkdownImageProps) {
  const [resolvedSrc, setResolvedSrc] = useState('')
  const [imageError, setImageError] = useState('')
  const source = src ?? ''
  const isExternalImage = /^(?:https?:|data:|blob:)/i.test(source)

  useEffect(() => {
    let cancelled = false
    setResolvedSrc('')
    setImageError('')

    if (!source) {
      setImageError('图片路径为空')
      return () => { cancelled = true }
    }

    if (isExternalImage) {
      setResolvedSrc(source)
      return () => { cancelled = true }
    }

    if (!markdownPath) {
      setImageError('打开 Markdown 文件后才能加载相对路径图片')
      return () => { cancelled = true }
    }

    const imagePath = source.split(/[?#]/, 1)[0]
    let decodedImagePath = imagePath
    try {
      decodedImagePath = decodeURIComponent(imagePath)
    } catch {
      setImageError('图片路径编码无效')
      return () => { cancelled = true }
    }

    void window.markdownEditor.readImage(markdownPath, decodedImagePath).then((result) => {
      if (cancelled) return
      if (result.ok) setResolvedSrc(result.dataUrl)
      else setImageError(result.error)
    }).catch(() => {
      if (!cancelled) setImageError('图片读取失败')
    })

    return () => { cancelled = true }
  }, [isExternalImage, markdownPath, source])

  if (imageError) return <span className="image-error">{alt || imageError}</span>
  if (!resolvedSrc) return <span className="image-loading">加载图片中…</span>
  return <img {...props} src={resolvedSrc} alt={alt ?? ''} loading="lazy" />
}

function displayName(filePath: string | null) {
  if (!filePath) return '未命名.md'
  return filePath.split(/[\\/]/).pop() || '未命名.md'
}

function App() {
  const [markdown, setMarkdown] = useState(starterMarkdown)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [splitRatio, setSplitRatio] = useState(50)
  const [theme, setTheme] = useState<Theme>('dark')
  const [codeTheme, setCodeTheme] = useState<CodeTheme>('dark')
  const [recentFiles, setRecentFiles] = useState<string[]>([])
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLElement>(null)

  const markdownFilePath = filePath

  useEffect(() => {
    let cancelled = false
    void window.markdownEditor.getPreferences().then((preferences) => {
      if (cancelled) return
      setTheme(preferences.theme)
      setSplitRatio(preferences.splitRatio)
      setRecentFiles(preferences.recentFiles)
      setPreferencesLoaded(true)
    }).catch((caughtError) => {
      if (!cancelled) setError(caughtError instanceof Error ? caughtError.message : '读取编辑器设置失败。')
    })

    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!preferencesLoaded) return
    void window.markdownEditor.setTheme(theme)
  }, [preferencesLoaded, theme])

  useEffect(() => {
    if (!preferencesLoaded) return
    const timer = window.setTimeout(() => {
      void window.markdownEditor.setSplitRatio(splitRatio)
    }, 180)
    return () => window.clearTimeout(timer)
  }, [preferencesLoaded, splitRatio])

  useEffect(() => {
    if (preferencesLoaded) {
      void window.markdownEditor.updateWindowTitle(filePath, isDirty)
    }
  }, [filePath, isDirty, preferencesLoaded])

  const confirmDiscard = () => {
    if (!isDirty) return true
    return window.confirm('当前文件有未保存修改，确定放弃这些修改吗？')
  }

  const addRecentFile = (path: string) => {
    setRecentFiles((current) => [path, ...current.filter((item) => item !== path)].slice(0, 8))
  }

  const loadSelection = async (selection: OpenFileResult) => {
    if (selection.canceled) return false
    const result = await window.markdownEditor.readFile(selection.filePath)
    if (!result.ok) {
      setError(result.error)
      return false
    }

    setMarkdown(result.content)
    setFilePath(selection.filePath)
    setIsDirty(false)
    addRecentFile(selection.filePath)
    return true
  }

  const handleOpen = async () => {
    if (!confirmDiscard()) return
    setError('')
    setNotice('')
    setIsLoading(true)
    try {
      await loadSelection(await window.markdownEditor.openFile())
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : '打开文件失败。')
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenRecent = async (path: string) => {
    if (!confirmDiscard()) return
    setError('')
    setNotice('')
    setIsLoading(true)
    try {
      const opened = await loadSelection(await window.markdownEditor.openRecentFile(path))
      if (!opened) setRecentFiles((current) => current.filter((item) => item !== path))
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : '打开最近文件失败。')
    } finally {
      setIsLoading(false)
    }
  }

  const handleNew = () => {
    if (!confirmDiscard()) return
    setError('')
    setNotice('')
    setMarkdown('')
    setFilePath(null)
    setIsDirty(false)
  }

  const handleSaveAs = async () => {
    setError('')
    setNotice('')
    setIsLoading(true)
    try {
      const result = await window.markdownEditor.saveFileAs(displayName(filePath), markdown)
      if (result.canceled) return
      if ('error' in result && result.error) {
        setError(result.error)
        return
      }
      setFilePath(result.filePath)
      setIsDirty(false)
      addRecentFile(result.filePath)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : '另存为失败。')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    if (!filePath) {
      await handleSaveAs()
      return
    }

    setError('')
    setNotice('')
    setIsLoading(true)
    try {
      const result = await window.markdownEditor.saveFile(filePath, markdown)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setIsDirty(false)
      addRecentFile(filePath)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : '保存失败。')
    } finally {
      setIsLoading(false)
    }
  }

  const waitForRenderedImages = async () => {
    const images = Array.from(previewRef.current?.querySelectorAll('img') ?? [])
    await Promise.all(images.map((image) => {
      if (image.complete) return Promise.resolve()
      return new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, 1500)
        image.addEventListener('load', () => {
          window.clearTimeout(timer)
          resolve()
        }, { once: true })
        image.addEventListener('error', () => {
          window.clearTimeout(timer)
          resolve()
        }, { once: true })
      })
    }))
  }

  const buildExportDocument = () => {
    const title = displayName(filePath).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character] ?? character)
    const content = previewRef.current?.innerHTML ?? ''

    return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="${title}">
    <title>${title}</title>
    <style>${exportStyles}</style>
  </head>
  <body class="theme-${theme}">
    <article class="preview code-theme-${codeTheme}">${content}</article>
  </body>
</html>`
  }

  const handleExport = async (format: 'html' | 'pdf') => {
    setError('')
    setNotice('')
    setIsLoading(true)
    try {
      await waitForRenderedImages()
      const html = buildExportDocument()
      const result = format === 'html'
        ? await window.markdownEditor.exportHtml(displayName(filePath), html)
        : await window.markdownEditor.exportPdf(displayName(filePath), html)

      if (result.canceled) return
      if ('error' in result && result.error) {
        setError(result.error)
        return
      }
      setNotice(`已导出${format === 'html' ? ' HTML' : ' PDF'}：${result.filePath}`)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : '导出失败。')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault()
        handleNew()
      } else if (event.key.toLowerCase() === 'o') {
        event.preventDefault()
        void handleOpen()
      } else if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (event.shiftKey) void handleSaveAs()
        else void handleSave()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filePath, isDirty, markdown])

  const handleDividerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.dataset.dragging = 'true'
  }

  const handleDividerPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.dataset.dragging !== 'true' || !workspaceRef.current) return
    const bounds = workspaceRef.current.getBoundingClientRect()
    const nextRatio = ((event.clientX - bounds.left) / bounds.width) * 100
    setSplitRatio(Math.min(78, Math.max(22, nextRatio)))
  }

  const stopDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.dataset.dragging = 'false'
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <main className={`app-shell theme-${theme}`}>
      <header className="toolbar">
        <div className="brand">
          <div className="brand-mark">M</div>
          <div>
            <div className="brand-title">Markdown Editor</div>
            <div className="brand-subtitle">轻量、专注的写作空间</div>
          </div>
        </div>

        <div className="toolbar-actions">
          <button className="toolbar-button primary" onClick={handleOpen} disabled={isLoading} title="Ctrl+O">
            <span className="button-icon">↥</span>{isLoading ? '处理中…' : '打开'}
          </button>
          <button className="toolbar-button" onClick={handleNew} disabled={isLoading} title="Ctrl+N">
            <span className="button-icon">＋</span>新建
          </button>
          <button className="toolbar-button" onClick={() => void handleSave()} disabled={isLoading} title="Ctrl+S">
            <span className="button-icon">↓</span>保存
          </button>
          <button className="toolbar-button" onClick={() => void handleSaveAs()} disabled={isLoading} title="Ctrl+Shift+S">
            <span className="button-icon">⇩</span>另存为
          </button>
          <details className="recent-menu">
            <summary className="toolbar-button"><span className="button-icon">◷</span>最近</summary>
            <div className="recent-popover">
              <div className="recent-title">最近打开</div>
              {recentFiles.length === 0 && <div className="recent-empty">暂无最近文件</div>}
              {recentFiles.map((path) => (
                <button key={path} className="recent-item" onClick={() => void handleOpenRecent(path)} title={path}>
                  <span>{displayName(path)}</span>
                  <small>{path}</small>
                </button>
              ))}
            </div>
          </details>
          <details className="export-menu">
            <summary className="toolbar-button"><span className="button-icon">⇧</span>导出</summary>
            <div className="export-popover">
              <button className="export-item" onClick={() => void handleExport('html')}>导出为 HTML</button>
              <button className="export-item" onClick={() => void handleExport('pdf')}>导出为 PDF</button>
            </div>
          </details>
          <div className="toolbar-divider" />
          <label className="theme-control">
            <span>主题</span>
            <select value={theme} onChange={(event) => setTheme(event.target.value as Theme)} aria-label="选择界面主题">
              <option value="light">浅色</option>
              <option value="dark">深色</option>
              <option value="sepia">护眼</option>
            </select>
          </label>
          <button
            className="toolbar-button code-theme-toggle"
            onClick={() => setCodeTheme((current) => current === 'dark' ? 'light' : 'dark')}
            aria-pressed={codeTheme === 'light'}
            title="切换代码块主题"
          >
            <span className="button-icon">{codeTheme === 'dark' ? '☾' : '☀'}</span>代码
          </button>
        </div>
      </header>

      <section className="workspace" ref={workspaceRef} style={{ gridTemplateColumns: `${splitRatio}% 8px ${100 - splitRatio}%` }}>
        <section className="panel editor-panel" aria-label="编辑区">
          <div className="panel-heading">
            <div className="heading-group">
              <span className="panel-label">编辑</span>
              <span className="file-name" title={filePath ?? '未命名.md'}>{filePath ?? '未命名.md'}</span>
              {isDirty && <span className="dirty-badge">未保存</span>}
            </div>
            <span className="word-count">{markdown.length} 字符</span>
          </div>
          <textarea
            className="editor"
            value={markdown}
            onChange={(event) => {
              setMarkdown(event.target.value)
              setIsDirty(true)
            }}
            spellCheck={false}
            aria-label="Markdown 编辑器"
          />
        </section>

        <div
          className="splitter"
          role="separator"
          aria-label="调整编辑区和预览区比例"
          aria-valuemin={22}
          aria-valuemax={78}
          aria-valuenow={Math.round(splitRatio)}
          tabIndex={0}
          onPointerDown={handleDividerPointerDown}
          onPointerMove={handleDividerPointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
        ><span /></div>

        <section className="panel preview-panel" aria-label="预览区">
          <div className="panel-heading">
            <span className="panel-label">预览</span>
            <span className="live-indicator"><i />实时预览</span>
          </div>
          <article className={`preview code-theme-${codeTheme}`} ref={previewRef}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              skipHtml
              components={{ img: (props) => <MarkdownImage {...props} markdownPath={markdownFilePath} /> }}
            >
              {markdown}
            </ReactMarkdown>
          </article>
        </section>
      </section>

      <footer className="statusbar">
        <span className="status-item"><i className="status-dot" />就绪</span>
        <span className="status-item">{filePath ? displayName(filePath) : '未命名.md'}{isDirty ? ' ●' : ''}</span>
        <span className="status-item">Markdown · UTF-8</span>
        {notice && <span className="status-notice">{notice}</span>}
        {error && <span className="status-error">{error}</span>}
      </footer>
    </main>
  )
}

export default App
