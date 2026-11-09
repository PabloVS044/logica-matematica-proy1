import { useState, type FormEvent } from 'react'

import { inputClass, RemoveButton } from './ui'

/** Lista de nombres que se agregan con Enter y se quitan con ×. Conserva el orden. */
export function ChipInput({
  items,
  label,
  placeholder,
  onAdd,
  onRemove,
  renderItem = (item) => item,
}: {
  items: readonly string[]
  label: string
  placeholder: string
  onAdd: (item: string) => void
  onRemove: (index: number) => void
  renderItem?: (item: string) => string
}) {
  const [draft, setDraft] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    const names = draft
      .split(/[\s,]+/)
      .map((name) => name.trim())
      .filter(Boolean)
    names.forEach(onAdd)
    setDraft('')
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((item, index) => (
        <span
          key={`${item}-${index}`}
          className="formula inline-flex items-center rounded-md bg-sunken pl-2 text-ink"
        >
          {renderItem(item)}
          <RemoveButton label={`Quitar ${item}`} onClick={() => onRemove(index)} />
        </span>
      ))}
      <form onSubmit={submit} className="inline-flex">
        <input
          aria-label={label}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className={`${inputClass} w-40 text-sm`}
        />
      </form>
    </div>
  )
}
