# Markdown Editor

一个使用 Electron + Vite + React + TypeScript 搭建的 Markdown 编辑器工程骨架。

预览区使用 `react-markdown` + `remark-gfm`，支持 GFM 标题、列表、表格、任务列表、引用、链接、删除线和图片；代码块通过 `rehype-highlight` + `highlight.js` 高亮，并可在工具栏切换浅色/深色代码主题。原始 HTML 已通过 `skipHtml` 关闭。

当前还支持浅色、深色、护眼三套界面主题；新建、打开、保存、另存为、最近文件和 Ctrl+N/O/S 快捷键。主题、最近文件、分屏比例以及窗口位置和大小会通过 `electron-store` 持久化。

工具栏的「导出」菜单支持导出独立 HTML 和 PDF。HTML 会把当前预览结果和主题 CSS 全部内联；PDF 使用 Electron 的 `webContents.printToPDF`，按 A4 页面、中文字体和分页规则生成。

## 环境要求

- Node.js 18 或更高版本
- npm 9 或更高版本

## 安装和运行

在当前目录执行：

```bash
npm install
npm run dev
```

开发模式会启动 Vite，并打开 Electron 窗口。

## 打包

```bash
npm run dist
```

Windows NSIS 安装包和 portable 包会输出到 `release` 目录。只构建 Windows 目标可以使用：

```bash
npm run dist:win
```

常见产物：

- `release/Markdown Editor Setup 0.1.0.exe`：Windows 安装包
- `release/Markdown Editor 0.1.0.exe`：Windows portable 免安装包
- `release/win-unpacked/`：未压缩的应用目录

生产构建前会自动运行 `npm run generate-icon`，生成 `build/icon.ico` 并作为应用图标使用。应用名和打包标识配置在 `package.json` 的 `build` 字段中。

## 目录结构

```text
markdown-editor/
├─ src/
│  ├─ main/                 # Electron 主进程
│  │  └─ index.ts           # 文件操作、设置持久化和窗口状态
│  ├─ preload/              # 安全桥接层
│  │  ├─ index.ts
│  │  └─ index.d.ts
│  ├─ renderer/             # React 渲染进程
│  │  ├─ index.html
│  │  └─ src/
│  │     ├─ App.tsx
│  │     ├─ exportStyles.css # HTML/PDF 导出的内联样式源
│  │     ├─ main.tsx
│  │     ├─ styles.css
│  │     └─ env.d.ts
│  └─ shared/
│     └─ types.ts           # IPC 类型定义
├─ electron.vite.config.ts
├─ build/icon.ico           # 自动生成的 Windows 应用图标
├─ scripts/generate-icon.mjs
├─ package.json
└─ tsconfig.json
```
