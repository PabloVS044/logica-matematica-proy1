import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { emptyProject, type Project } from '../lib/project'

interface ProjectStore {
  project: Project
  /** Aplica una operación pura de `lib/projectOps` al proyecto actual. */
  update: (operation: (project: Project) => Project) => void
  load: (project: Project) => void
  reset: () => void
}

/** localStorage puede no estar disponible (modo privado, permisos): se ignora el error. */
const safeStorage = createJSONStorage(() => ({
  getItem: (key) => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* sin autoguardado */
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key)
    } catch {
      /* sin autoguardado */
    }
  },
}))

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      project: emptyProject,
      update: (operation) => set((state) => ({ project: operation(state.project) })),
      load: (project) => set({ project }),
      reset: () => set({ project: emptyProject }),
    }),
    { name: 'evaluador-semantico:proyecto', version: 1, storage: safeStorage },
  ),
)

export const useProject = () => useProjectStore((state) => state.project)
export const useUpdate = () => useProjectStore((state) => state.update)
