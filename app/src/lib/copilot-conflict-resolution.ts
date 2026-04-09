/** Resolution suggestion for a single conflicted file. */
export interface IFileResolution {
  /** Repository-relative file path that was resolved. */
  readonly path: string
  /** The fully resolved file content (all conflict markers removed). */
  readonly resolvedContent: string
  /** Human-readable explanation of how and why conflicts were resolved this way. */
  readonly reasoning: string
}

/** Complete response from Copilot conflict resolution. */
export interface ICopilotConflictResolutionResponse {
  /** Resolution suggestions, one per conflicted file. */
  readonly resolutions: ReadonlyArray<IFileResolution>
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parse the raw string response from the Copilot SDK into a structured
 * conflict resolution response.
 *
 * Handles markdown code-block wrapping (` ```json ... ``` `) and validates
 * all required fields.
 */
export function parseCopilotConflictResolution(
  content: string
): ICopilotConflictResolutionResponse {
  const jsonMatch =
    content.match(/```json\s*([\s\S]*?)```/) ||
    content.match(/```\s*([\s\S]*?)```/)
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error(
      'Copilot returned invalid JSON for conflict resolution generation'
    )
  }

  if (!isRecord(parsed)) {
    throw new Error(
      'Copilot returned an invalid conflict resolution payload: expected an object'
    )
  }

  const { resolutions } = parsed

  if (!Array.isArray(resolutions)) {
    throw new Error(
      'Copilot returned an invalid conflict resolution payload: "resolutions" must be an array'
    )
  }

  if (resolutions.length === 0) {
    throw new Error(
      'Copilot returned an invalid conflict resolution payload: "resolutions" must not be empty'
    )
  }

  const validated: Array<IFileResolution> = []

  for (let i = 0; i < resolutions.length; i++) {
    const entry: unknown = resolutions[i]

    if (!isRecord(entry)) {
      throw new Error(
        `Copilot returned an invalid conflict resolution payload: resolution at index ${i} must be an object`
      )
    }

    const { path, resolvedContent, reasoning } = entry

    if (typeof path !== 'string' || path.trim().length === 0) {
      throw new Error(
        `Copilot returned an invalid conflict resolution payload: "path" at index ${i} must be a non-empty string`
      )
    }

    if (typeof resolvedContent !== 'string') {
      throw new Error(
        `Copilot returned an invalid conflict resolution payload: "resolvedContent" at index ${i} must be a string`
      )
    }

    if (typeof reasoning !== 'string' || reasoning.trim().length === 0) {
      throw new Error(
        `Copilot returned an invalid conflict resolution payload: "reasoning" at index ${i} must be a non-empty string`
      )
    }

    validated.push({ path, resolvedContent, reasoning })
  }

  return { resolutions: validated }
}
