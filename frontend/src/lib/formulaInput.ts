/** Utilidades del editor de fórmulas: inserción en el cursor y atajos de teclado. */

export interface Edit {
  text: string
  cursor: number
}

/** Inserta `symbol` reemplazando la selección [start, end) y deja el cursor después. */
export function insertAt(text: string, start: number, end: number, symbol: string): Edit {
  return { text: text.slice(0, start) + symbol + text.slice(end), cursor: start + symbol.length }
}

/** Secuencias ASCII que se convierten al símbolo del curso mientras se escribe. */
const SHORTCUTS: [string, string][] = [
  ['->', '→'],
  ['=>', '→'],
  ['/\\', '∧'],
  ['\\/', '∨'],
  ['\\A', '∀'],
  ['\\E', '∃'],
  ['&', '∧'],
  ['|', '∨'],
  ['~', '¬'],
  ['!', '¬'],
]

/**
 * Reemplaza los atajos que terminan exactamente en la posición del cursor.
 * Solo mira lo recién escrito, así no altera texto pegado ni el resto de la fórmula.
 */
export function applyShortcut(text: string, cursor: number): Edit {
  for (const [ascii, symbol] of SHORTCUTS) {
    const start = cursor - ascii.length
    if (start >= 0 && text.slice(start, cursor) === ascii) {
      return insertAt(text, start, cursor, symbol)
    }
  }
  return { text, cursor }
}
