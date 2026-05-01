import {
  Bot,
  ChevronDown,
  Clock3,
  FolderPlus,
  Globe2,
  Hammer,
  Loader2,
  MessageSquarePlus,
  PanelLeftClose,
  Settings,
  User
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { Task, Workspace } from '../../lib/api'
import { SidebarWorkspaceNode } from '../workspace/SidebarWorkspaceNode'

type SidebarViewMode = 'tasks' | 'search' | 'scheduled' | 'projects' | 'dispatch' | 'ideas' | 'skills'
const THEME_OPTIONS = ['亮色', '暗色', '跟随系统']

function getNextTheme(current: string) {
  const currentIndex = THEME_OPTIONS.indexOf(current)
  const safeIndex = currentIndex === -1 ? 0 : currentIndex
  return THEME_OPTIONS[(safeIndex + 1) % THEME_OPTIONS.length]
}

type SidebarWorkspaceGroup = {
  workspace: Workspace
  tasks: Task[]
  archivedTasks: Task[]
}

export function AppSidebar({
  viewMode,
  selectedWorkspaceId,
  selectedTaskId,
  sidebarWorkspaceGroups,
  workspacePicking,
  workspaceUpdatingId,
  accountMenuOpen,
  language,
  theme,
  onCollapse,
  onNewTask,
  onAuthorizeWorkspace,
  onOpenWorkspace,
  onOpenTask,
  onArchiveTask,
  onDeleteTask,
  onRevealWorkspace,
  onRenameWorkspace,
  onReauthorizeWorkspace,
  onRemoveWorkspace,
  onOpenSkills,
  onOpenScheduled,
  onOpenDispatch,
  onThemeChange,
  onOpenSettings,
  onCloseAccountMenu,
  onToggleAccountMenu
}: {
  viewMode: SidebarViewMode
  selectedWorkspaceId: string
  selectedTaskId: string | null | undefined
  sidebarWorkspaceGroups: SidebarWorkspaceGroup[]
  workspacePicking: boolean
  workspaceUpdatingId: string | null
  accountMenuOpen: boolean
  language: string
  theme: string
  onCollapse: () => void
  onNewTask: () => void
  onAuthorizeWorkspace: () => void
  onOpenWorkspace: (workspace: Workspace) => void
  onOpenTask: (task: Task) => void
  onArchiveTask: (task: Task) => void
  onDeleteTask: (task: Task) => void
  onRevealWorkspace: (workspace: Workspace) => void
  onRenameWorkspace: (workspace: Workspace) => void
  onReauthorizeWorkspace: (workspace: Workspace) => void
  onRemoveWorkspace: (workspace: Workspace) => void
  onOpenSkills: () => void
  onOpenScheduled: () => void
  onOpenDispatch: () => void
  onThemeChange: (value: string) => void
  onOpenSettings: () => void
  onCloseAccountMenu: () => void
  onToggleAccountMenu: () => void
}) {
  const accountFootRef = useRef<HTMLDivElement | null>(null)
  const nextTheme = getNextTheme(theme)

  useEffect(() => {
    if (!accountMenuOpen) return undefined

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (!accountFootRef.current?.contains(target)) {
        onCloseAccountMenu()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [accountMenuOpen, onCloseAccountMenu])

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <Bot size={19} />
        </div>
        <div className="brand-copy">
          <strong>Hermes Cowork</strong>
          <span>本机智能体工作台</span>
        </div>
        <button
          type="button"
          className="icon-button sidebar-collapse-button"
          title="隐藏左侧导航"
          aria-label="隐藏左侧导航"
          onClick={onCollapse}
        >
          <PanelLeftClose size={15} />
        </button>
      </div>

      <button className="primary-nav" onClick={onNewTask}>
        <MessageSquarePlus size={17} />
        新建任务
      </button>

      <div className="sidebar-section workspace-tree-section">
        <div className="section-title">
          <span>工作区</span>
          <button
            className="icon-button"
            title="新增工作区：选择一个新的本机文件夹授权给 Hermes"
            aria-label="新增工作区"
            onClick={onAuthorizeWorkspace}
            disabled={workspacePicking}
          >
            {workspacePicking ? <Loader2 size={15} className="spin" /> : <FolderPlus size={15} />}
          </button>
        </div>
        <div className="workspace-tree-list">
          {sidebarWorkspaceGroups.map((group) => (
            <SidebarWorkspaceNode
              key={group.workspace.id}
              workspace={group.workspace}
              tasks={group.tasks}
              archivedTasks={group.archivedTasks}
              activeWorkspace={group.workspace.id === selectedWorkspaceId && viewMode === 'projects'}
              activeTaskId={selectedTaskId ?? null}
              onOpenWorkspace={() => onOpenWorkspace(group.workspace)}
              onOpenTask={onOpenTask}
              onArchiveTask={onArchiveTask}
              onDeleteTask={onDeleteTask}
              onReveal={() => onRevealWorkspace(group.workspace)}
              onRename={() => onRenameWorkspace(group.workspace)}
              onReauthorize={() => onReauthorizeWorkspace(group.workspace)}
              onRemove={() => onRemoveWorkspace(group.workspace)}
              updating={workspaceUpdatingId === group.workspace.id}
            />
          ))}
          {!sidebarWorkspaceGroups.length && (
            <p className="empty-copy">先选择一个文件夹授权给 Hermes。</p>
          )}
        </div>
      </div>

      <div className="sidebar-nav-group">
        <button
          className={viewMode === 'skills' ? 'secondary-nav active' : 'secondary-nav'}
          onClick={onOpenSkills}
        >
          <Hammer size={17} />
          技能
        </button>

        <button
          className={viewMode === 'scheduled' ? 'secondary-nav active' : 'secondary-nav'}
          onClick={onOpenScheduled}
        >
          <Clock3 size={17} />
          定时任务
        </button>

        <button
          className={viewMode === 'dispatch' ? 'secondary-nav active' : 'secondary-nav'}
          onClick={onOpenDispatch}
        >
          <Globe2 size={17} />
          调度
        </button>
      </div>

      <div className="sidebar-foot" ref={accountFootRef}>
        {accountMenuOpen && (
          <div className="account-popover">
            <div className="account-popover-user">
              <div className="account-avatar">
                <User size={16} />
              </div>
              <strong>Lucas</strong>
            </div>
            <button type="button">
              <span>语言</span>
              <em>{language}</em>
              <ChevronDown size={13} />
            </button>
            <button
              type="button"
              title={`切换主题：当前 ${theme}，点击后切到 ${nextTheme}`}
              aria-label={`切换主题：当前 ${theme}，点击后切到 ${nextTheme}`}
              onClick={() => onThemeChange(nextTheme)}
            >
              <span>主题</span>
              <em>{theme}</em>
              <ChevronDown size={13} />
            </button>
            <button type="button" onClick={onOpenSettings}>
              设置
            </button>
          </div>
        )}
        <button
          type="button"
          className="sidebar-user-button"
          title="本机偏好与设置"
          aria-label="本机偏好与设置"
          onClick={onToggleAccountMenu}
        >
          <span className="account-avatar">
            <User size={15} />
          </span>
          <strong>Lucas</strong>
          <span className="local-badge">本机</span>
          <span className="sidebar-settings-cue">
            <Settings size={13} />
          </span>
        </button>
      </div>
    </aside>
  )
}
