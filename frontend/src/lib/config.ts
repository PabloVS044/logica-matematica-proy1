/** Secciones de la configuración del proyecto, que se editan en un modal. */
export type ConfigTab = 'lenguaje' | 'interpretacion' | 'entorno'

export const CONFIG_TABS: { id: ConfigTab; label: string }[] = [
  { id: 'lenguaje', label: 'Lenguaje' },
  { id: 'interpretacion', label: 'Interpretación' },
  { id: 'entorno', label: 'Entorno' },
]

/** Estado de cada sección de la configuración: si tiene errores o algo pendiente. */
export type ConfigStatus = Record<ConfigTab, 'ok' | 'pending' | 'error'>
