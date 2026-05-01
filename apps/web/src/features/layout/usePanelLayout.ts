import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from 'react'

const PANEL_LAYOUT_STORAGE_KEY = 'hermes-cowork-panel-layout-v2'
const DEFAULT_SIDEBAR_WIDTH = 286
const DEFAULT_INSPECTOR_WIDTH = 560
const MIN_SIDEBAR_WIDTH = 220
const MAX_SIDEBAR_WIDTH = 380
const MIN_MAIN_WIDTH = 520
const MIN_INSPECTOR_WIDTH = 420
const MAX_INSPECTOR_WIDTH = 1120

type PaneResizeTarget = 'left' | 'right'
type PanelLayout = {
  left: number
  right: number
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function clampPanelLayout(layout: PanelLayout, options: { leftCollapsed?: boolean } = {}): PanelLayout {
  const viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth || 1440
  const left = clampNumber(layout.left, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH)
  const effectiveLeft = options.leftCollapsed ? 0 : left
  const maxRightByViewport = Math.max(MIN_INSPECTOR_WIDTH, viewportWidth - effectiveLeft - MIN_MAIN_WIDTH)
  const right = clampNumber(layout.right, MIN_INSPECTOR_WIDTH, Math.min(MAX_INSPECTOR_WIDTH, maxRightByViewport))
  return { left, right }
}

function readPanelLayout(): PanelLayout {
  if (typeof window === 'undefined') {
    return { left: DEFAULT_SIDEBAR_WIDTH, right: DEFAULT_INSPECTOR_WIDTH }
  }
  const stored = window.localStorage.getItem(PANEL_LAYOUT_STORAGE_KEY)
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Partial<PanelLayout>
      if (typeof parsed.left === 'number' && typeof parsed.right === 'number') {
        return clampPanelLayout({ left: parsed.left, right: parsed.right })
      }
    } catch {
      window.localStorage.removeItem(PANEL_LAYOUT_STORAGE_KEY)
    }
  }
  return clampPanelLayout({
    left: DEFAULT_SIDEBAR_WIDTH,
    right: Math.round((window.innerWidth || 1440) * 0.32)
  })
}

export function usePanelLayout() {
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false)
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false)
  const [panelLayout, setPanelLayout] = useState<PanelLayout>(() => readPanelLayout())
  const [draggingPane, setDraggingPane] = useState<PaneResizeTarget | null>(null)
  const panelLayoutRef = useRef(panelLayout)

  useEffect(() => {
    panelLayoutRef.current = panelLayout
  }, [panelLayout])

  useEffect(() => {
    window.localStorage.setItem(PANEL_LAYOUT_STORAGE_KEY, JSON.stringify(panelLayout))
  }, [panelLayout])

  useEffect(() => {
    const handleResize = () => {
      setPanelLayout((current) => clampPanelLayout(current, { leftCollapsed: leftSidebarCollapsed }))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [leftSidebarCollapsed])

  const startPaneResize = (target: PaneResizeTarget, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    setDraggingPane(target)
    const startX = event.clientX
    const startLayout = panelLayoutRef.current
    document.body.classList.add('resizing-panels')

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX
      const nextLayout =
        target === 'left'
          ? { ...startLayout, left: startLayout.left + deltaX }
          : { ...startLayout, right: startLayout.right - deltaX }
      setPanelLayout(clampPanelLayout(nextLayout, { leftCollapsed: leftSidebarCollapsed }))
    }

    const stopResize = () => {
      setDraggingPane(null)
      document.body.classList.remove('resizing-panels')
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResize)
      window.removeEventListener('pointercancel', stopResize)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResize)
    window.addEventListener('pointercancel', stopResize)
  }

  const panelLayoutStyle = useMemo(
    () =>
      ({
        '--sidebar-width': `${panelLayout.left}px`,
        '--inspector-width': `${panelLayout.right}px`
      }) as CSSProperties,
    [panelLayout.left, panelLayout.right]
  )

  return {
    leftSidebarCollapsed,
    setLeftSidebarCollapsed,
    rightSidebarCollapsed,
    setRightSidebarCollapsed,
    panelLayout,
    draggingPane,
    startPaneResize,
    panelLayoutStyle
  }
}
