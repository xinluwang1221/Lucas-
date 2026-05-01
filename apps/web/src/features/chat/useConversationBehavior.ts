import {
  useCallback,
  useEffect,
  useRef,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'
import type { Task } from '../../lib/api'

type SubmitPrompt = () => Promise<void>

type UseConversationBehaviorParams = {
  selectedTask?: Task
  selectedTaskId: string | null | undefined
}

export function useConversationBehavior({ selectedTask, selectedTaskId }: UseConversationBehaviorParams) {
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null)
  const conversationRef = useRef<HTMLElement | null>(null)
  const conversationEndRef = useRef<HTMLDivElement | null>(null)
  const conversationFollowRef = useRef(true)

  const focusComposer = useCallback(() => {
    window.requestAnimationFrame(() => {
      const input = promptInputRef.current
      if (!input) return
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
    })
  }, [])

  const scrollConversationToBottom = useCallback(() => {
    window.requestAnimationFrame(() => {
      conversationEndRef.current?.scrollIntoView({ block: 'end' })
    })
  }, [])

  const handleConversationScroll = useCallback(() => {
    const element = conversationRef.current
    if (!element) return
    conversationFollowRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 180
  }, [])

  const createSubmitHandler = useCallback((submitPrompt: SubmitPrompt) => {
    return async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      await submitPrompt()
    }
  }, [])

  const createPromptKeyDownHandler = useCallback((submitPrompt: SubmitPrompt) => {
    return (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
      event.preventDefault()
      void submitPrompt()
    }
  }, [])

  useEffect(() => {
    conversationFollowRef.current = true
    scrollConversationToBottom()
  }, [scrollConversationToBottom, selectedTaskId])

  useEffect(() => {
    if (!selectedTask || !conversationFollowRef.current) return
    scrollConversationToBottom()
  }, [
    scrollConversationToBottom,
    selectedTask,
    selectedTask?.id,
    selectedTask?.status,
    selectedTask?.updatedAt,
    selectedTask?.liveResponse?.length,
    selectedTask?.events?.length,
    selectedTask?.messages.length,
    selectedTask?.artifacts.length
  ])

  return {
    promptInputRef,
    conversationRef,
    conversationEndRef,
    focusComposer,
    handleConversationScroll,
    createSubmitHandler,
    createPromptKeyDownHandler
  }
}
