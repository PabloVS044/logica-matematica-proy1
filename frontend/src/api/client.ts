import type { components } from './schema'

export type Schemas = components['schemas']
export type ProjectIn = Schemas['ProjectIn']
export type LanguageIn = Schemas['LanguageIn']
export type InterpretationIn = Schemas['InterpretationIn']
export type Diagnostic = Schemas['DiagnosticOut']
export type DiagnosticsOut = Schemas['DiagnosticsOut']
export type FormulaAnalysis = Schemas['FormulaAnalysisOut']
export type Evaluation = Schemas['EvaluationOut']
export type ExplainNode = Schemas['ExplainNodeOut']
export type Example = Schemas['ExampleOut']

export class ApiError extends Error {}

async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError('No hay conexión con el servidor. Verifica que el backend esté en marcha.')
  }
  if (!response.ok) {
    throw new ApiError(`El servidor respondió con un error (${response.status}).`)
  }
  return (await response.json()) as T
}

export const api = {
  validateLanguage: (language: LanguageIn, signal?: AbortSignal) =>
    request<DiagnosticsOut>('/language/validate', language, signal),
  analyzeFormula: (language: LanguageIn, formula: string, signal?: AbortSignal) =>
    request<FormulaAnalysis>('/formula/analyze', { language, formula }, signal),
  validateInterpretation: (
    language: LanguageIn,
    interpretation: InterpretationIn,
    signal?: AbortSignal,
  ) => request<DiagnosticsOut>('/interpretation/validate', { language, interpretation }, signal),
  evaluate: (project: ProjectIn) => request<Evaluation>('/evaluate', project),
  examples: () => request<Example[]>('/examples'),
}
