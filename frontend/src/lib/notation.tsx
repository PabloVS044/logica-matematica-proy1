import { Fragment, type ReactNode } from 'react'

/**
 * Muestra la notación del curso: "ℐ ⊨_{l[x↦a]} φ" se dibuja con el entorno como subíndice.
 */
export function Notation({ text }: { text: string }): ReactNode {
  const parts: ReactNode[] = []
  const pattern = /_\{([^}]*)\}/g
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    parts.push(text.slice(last, index))
    parts.push(
      <sub key={index} className="text-[0.72em]">
        {match[1]}
      </sub>,
    )
    last = index + match[0].length
  }
  parts.push(text.slice(last))
  return <Fragment>{parts}</Fragment>
}
