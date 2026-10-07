/**
 * Monaco, configured for local bundling.
 *
 * `loader.config({ monaco })` is the important line: without it `@monaco-editor/react`
 * fetches Monaco from a CDN at runtime, which would break offline use and leak which
 * lessons a learner opens to a third party.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import Editor, { loader, type OnMount } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import type { CodeEditorProps } from './CodeEditor'

/**
 * Monaco finds its language workers through this global. Vite's `?worker` imports give
 * us real bundled workers, so nothing is fetched from a CDN and offline use works.
 *
 * Only the editor and TypeScript workers are imported. The CSS, HTML and JSON workers
 * account for about 500 KB of build output and this platform has no CSS, HTML or JSON
 * editors — SQL, Ruby, Python and the rest are syntax-highlighted by Monaco's main
 * thread and need no worker at all.
 */
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  },
}

loader.config({ monaco })

const THEME_LIGHT = 'rubiq-light'
const THEME_DARK = 'rubiq-dark'
let themesDefined = false

function defineThemes(instance: typeof monaco) {
  if (themesDefined) return
  themesDefined = true

  instance.editor.defineTheme(THEME_LIGHT, {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '767d8c', fontStyle: 'italic' },
      { token: 'keyword', foreground: '8a2c62' },
      { token: 'string', foreground: '11633f' },
      { token: 'number', foreground: '8a4a00' },
      { token: 'type', foreground: '0f5f73' },
    ],
    colors: {
      'editor.background': '#f7f8fa',
      'editor.foreground': '#16181d',
      'editorLineNumber.foreground': '#a8aeb9',
      'editorLineNumber.activeForeground': '#585e6b',
      'editor.selectionBackground': '#dfe3fd',
      'editor.lineHighlightBackground': '#eef0f3',
      'editorIndentGuide.background1': '#e3e6ea',
    },
  })

  instance.editor.defineTheme(THEME_DARK, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '7f8796', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'e79bc6' },
      { token: 'string', foreground: '6fcf9b' },
      { token: 'number', foreground: 'e8b277' },
      { token: 'type', foreground: '6fc7dd' },
    ],
    colors: {
      'editor.background': '#16191f',
      'editor.foreground': '#eceef2',
      'editorLineNumber.foreground': '#4e5663',
      'editorLineNumber.activeForeground': '#a2aab8',
      'editor.selectionBackground': '#2c3356',
      'editor.lineHighlightBackground': '#1c2029',
      'editorIndentGuide.background1': '#2a2f3a',
    },
  })
}

const LANGUAGE_MAP: Record<string, string> = {
  javascript: 'javascript',
  typescript: 'typescript',
  sql: 'sql',
  ruby: 'ruby',
  python: 'python',
  go: 'go',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  csharp: 'csharp',
  php: 'php',
  rust: 'rust',
  text: 'plaintext',
}

export default function MonacoEditor({
  value, onChange, language, height = 320, readOnly, onRun, ariaLabel,
}: CodeEditorProps) {
  const runRef = useRef(onRun)
  runRef.current = onRun

  const isDark =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  const onMount = useCallback<OnMount>((editor, instance) => {
    defineThemes(instance)

    // Cmd/Ctrl+Enter runs. Reading from a ref so the binding does not need rebuilding
    // every time the parent re-renders.
    editor.addCommand(
      instance.KeyMod.CtrlCmd | instance.KeyCode.Enter,
      () => runRef.current?.(),
    )

    editor.updateOptions({ ariaLabel })

    // Exercises are small; TypeScript's module resolution complaints about a standalone
    // snippet are noise that would teach the learner to ignore the editor's warnings.
    instance.languages.typescript?.typescriptDefaults.setDiagnosticsOptions({
      diagnosticCodesToIgnore: [2304, 2307, 2451, 1375, 1378],
    })
  }, [ariaLabel])

  // Keep the editor theme in step with the app's theme toggle.
  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => {
      monaco.editor.setTheme(root.classList.contains('dark') ? THEME_DARK : THEME_LIGHT)
    })
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const options = useMemo<monaco.editor.IStandaloneEditorConstructionOptions>(() => ({
    readOnly: readOnly ?? false,
    minimap: { enabled: false },
    fontSize: 13,
    fontFamily: 'var(--font-mono), monospace',
    lineHeight: 1.7,
    padding: { top: 14, bottom: 14 },
    scrollBeyondLastLine: false,
    renderLineHighlight: 'line',
    smoothScrolling: false,
    cursorBlinking: 'smooth',
    tabSize: 2,
    wordWrap: 'on',
    automaticLayout: true,
    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    overviewRulerLanes: 0,
    folding: false,
    lineNumbersMinChars: 3,
    // Monaco traps Tab by default, which makes it a keyboard trap. This lets Tab move
    // focus out until the learner presses Ctrl+M to opt into indentation.
    tabFocusMode: false,
    accessibilitySupport: 'auto',
  }), [readOnly])

  return (
    <Editor
      height={height}
      language={LANGUAGE_MAP[language] ?? 'plaintext'}
      value={value}
      theme={isDark ? THEME_DARK : THEME_LIGHT}
      onChange={(next) => onChange(next ?? '')}
      onMount={onMount}
      options={options}
      loading={
        <div className="p-4 font-mono text-xs text-ink-faint">Loading editor…</div>
      }
    />
  )
}
