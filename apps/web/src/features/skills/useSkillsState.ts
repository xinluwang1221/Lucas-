import { useCallback, useState } from 'react'
import {
  listSkillFiles,
  listSkills,
  readSkillFile,
  toggleSkill,
  uploadSkill
} from './skillsApi'
import type { Skill, SkillFile } from '../../lib/api'

export function useSkillsState() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [customizeTab, setCustomizeTab] = useState<'skills' | 'connectors'>('skills')
  const [skillTab, setSkillTab] = useState<'market' | 'installed'>('installed')
  const [skillQuery, setSkillQuery] = useState('')
  const [skillNotice, setSkillNotice] = useState<string | null>(null)
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [skillFiles, setSkillFiles] = useState<SkillFile[]>([])
  const [selectedSkillFile, setSelectedSkillFile] = useState<SkillFile | null>(null)
  const [skillFileContent, setSkillFileContent] = useState('')
  const [skillFileError, setSkillFileError] = useState<string | null>(null)

  const refreshSkills = useCallback(async () => {
    setSkills(await listSkills())
  }, [])

  const handleSelectSkillFile = useCallback(async (skillId: string, file: SkillFile) => {
    setSelectedSkillFile(file)
    setSkillFileContent('')
    setSkillFileError(null)
    if (file.type === 'directory') return
    if (!file.previewable) {
      setSkillFileError('这个文件暂不支持文本预览。')
      return
    }
    try {
      setSkillFileContent(await readSkillFile(skillId, file.relativePath))
    } catch (cause) {
      setSkillFileError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  const handleOpenSkill = useCallback(
    async (skill: Skill) => {
      setSelectedSkill(skill)
      setSkillFiles([])
      setSelectedSkillFile(null)
      setSkillFileContent('')
      setSkillFileError(null)
      try {
        const files = await listSkillFiles(skill.id)
        setSkillFiles(files)
        const firstFile = files.find((file) => file.relativePath === 'SKILL.md') ?? files.find((file) => file.type === 'file')
        if (firstFile) {
          await handleSelectSkillFile(skill.id, firstFile)
        }
      } catch (cause) {
        setSkillFileError(cause instanceof Error ? cause.message : String(cause))
      }
    },
    [handleSelectSkillFile]
  )

  const handleToggleSkill = useCallback(
    async (skill: Skill) => {
      setSkillNotice(null)
      const nextEnabled = !skill.enabled
      await toggleSkill(skill.id, nextEnabled)
      await refreshSkills()
      setSelectedSkill((current) => current?.id === skill.id ? { ...current, enabled: nextEnabled } : current)
    },
    [refreshSkills]
  )

  const handleSkillUpload = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0]
      if (!file) return
      setSkillNotice(null)
      try {
        await uploadSkill(file)
        await refreshSkills()
        setSkillTab('installed')
        setSkillNotice(`已上传 ${file.name}`)
      } catch (cause) {
        setSkillNotice(cause instanceof Error ? cause.message : String(cause))
      }
    },
    [refreshSkills]
  )

  return {
    skills,
    customizeTab,
    setCustomizeTab,
    skillTab,
    setSkillTab,
    skillQuery,
    setSkillQuery,
    skillNotice,
    setSkillNotice,
    selectedSkill,
    setSelectedSkill,
    skillFiles,
    selectedSkillFile,
    skillFileContent,
    skillFileError,
    refreshSkills,
    handleToggleSkill,
    handleSkillUpload,
    handleOpenSkill,
    handleSelectSkillFile
  }
}
