import { CopilotClient } from '@github/copilot-sdk'
import type { ModelInfo } from '@github/copilot-sdk'
import { AccountsStore } from './accounts-store'
import { Account, isDotComAccount } from '../../models/account'
import {
  ICopilotCommitMessage,
  parseCopilotCommitMessage,
} from '../copilot-commit-message'
import {
  ICopilotConflictResolutionResponse,
  IFileResolution,
  parseCopilotConflictResolution,
} from '../copilot-conflict-resolution'
import {
  ICopilotConflictContext,
  IConflictCommitContext,
  IFileConflictContext,
  formatConflictContextForPrompt,
} from '../copilot-conflict-context'
import { PullRequest } from '../../models/pull-request'
import * as ipcRenderer from '../ipc-renderer'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { BaseStore } from './base-store'

/** The default model ID used for Copilot commit message generation. */
export const DefaultCopilotModel = 'gpt-5-mini'
const DefaultReasoningEffort: ReasoningEffort = 'low'

/** Copilot features that support per-model selection. */
export type CopilotFeature = 'commit-message-generation'

/**
 * Per-feature model selections. An absent key means the default model
 * will be used for that feature.
 */
export type CopilotModelSelections = Partial<Record<CopilotFeature, string>>

/**
 * How long to cache the model list before re-fetching from the SDK.
 * Matches the MaxFetchFrequency pattern used by other stores (e.g. GitHubUserStore).
 */
const ModelListCacheTTL = 10 * 60 * 1000

/**
 * Returns the path of the executable (Electron/Node) used to run the Copilot CLI.
 *
 * This corresponds to the value of `process.execPath` used when launching the
 * Copilot CLI via an eval-based entry point (for example, `--eval "import './index.js'"`).
 */
export async function getCopilotCLIPath(): Promise<string> {
  return ipcRenderer.invoke('get-exec-path')
}

function getCopilotCLIDir(): string {
  return join(__dirname, 'copilot')
}

/**
 * System prompt for the Copilot commit message generation session.
 */
const CommitMessageSystemPrompt = `
You're an AI assistant whose job is to concisely summarize code changes into
short, useful commit messages, with a title and a description.

A changeset is given in the git diff output format, affecting one or multiple files.

The commit title should be no longer than 50 characters and should summarize the
contents of the changeset for other developers reading the commit history.

The commit description can be longer, and should provide more context about the
changeset, including why the changeset is being made, and any other relevant
information. The commit description is optional, so you can omit it if the
changeset is small enough that it can be described in the commit title or if you
don't have enough context.

Be brief and concise.

Do NOT include a description of changes in "lock" files from dependency managers
like npm, yarn, or pip (and others), unless those are the only changes in the commit.

Your response must be a JSON object with the attributes "title" and "description"
containing the commit title and commit description. Do not use markdown to wrap
the JSON object, just return it as plain text. For example:

{
  "title": "Fix issue with login form",
  "description": "The login form was not submitting correctly. This commit fixes that issue by adding a missing \`name\` attribute to the submit button."
}
`

/** Ordered reasoning effort levels from lowest to highest. */
const ReasoningEffortOrder = ['low', 'medium', 'high', 'xhigh'] as const

type ReasoningEffort = typeof ReasoningEffortOrder[number]

/**
 * Returns the lowest reasoning effort supported by the given model, or
 * undefined if the model does not support reasoning effort configuration.
 */
export function getLowestReasoningEffort(
  model: ModelInfo
): ReasoningEffort | undefined {
  const supported = model.supportedReasoningEfforts as
    | ReadonlyArray<ReasoningEffort>
    | undefined
  if (!supported || supported.length === 0) {
    return undefined
  }
  return ReasoningEffortOrder.find(e => supported.includes(e))
}

/**
 * Selects the model to use for commit message generation. Prefers
 * `DefaultCopilotModel` if it is in the list; otherwise falls back to the
 * cheapest available model by billing multiplier.
 *
 * Returns null if the model list is empty.
 */
export function getPreferredDefaultModel(
  models: ReadonlyArray<ModelInfo>
): ModelInfo | null {
  if (models.length === 0) {
    return null
  }

  const defaultModel = models.find(m => m.id === DefaultCopilotModel)
  if (defaultModel !== undefined) {
    return defaultModel
  }

  // Default model unavailable — pick the cheapest one. Models without billing
  // info are treated as most expensive (unknown cost) so we don't accidentally
  // pick a costly model.
  return [...models].sort(
    (a, b) =>
      (a.billing?.multiplier ?? Infinity) - (b.billing?.multiplier ?? Infinity)
  )[0]
}

/**
 * System prompt for the Copilot conflict resolution session.
 */
const ConflictResolutionSystemPrompt = `
You have all the context you need below. Do NOT attempt to use tools. Respond ONLY with the JSON format specified.

You are an expert Git conflict resolver. Your task is to analyze conflicts from merge, rebase, or cherry-pick operations and produce correct, clean resolutions.

You will receive:
- Labels for both sides of the conflict (e.g., branch names or commit references)
- The conflict markers from each conflicted file (ours, theirs, and optionally base content)
- Context lines surrounding each conflict
- When available: recent commit messages from both sides explaining the intent behind changes
- When available: the pull request title and description providing higher-level context

Your job:
1. Understand the INTENT behind each side's changes using commit messages and PR context when available
2. Resolve each conflict by producing the correct merged content
3. Explain your reasoning for each resolution

Resolution guidelines:
- When both sides add complementary code (e.g., different imports, different functions), combine them
- When both sides modify the same code differently, use commit messages and PR context to determine the correct resolution
- When one side deletes code the other modifies, determine if the deletion was intentional
- Preserve code correctness: imports, types, formatting must be valid
- When in doubt, prefer the approach that maintains backward compatibility

You MUST respond with valid JSON in this exact format:
{
  "resolutions": [
    {
      "path": "relative/file/path.ts",
      "resolvedContent": "the complete resolved file content with all conflicts resolved",
      "reasoning": "explanation of how you resolved each conflict and why"
    }
  ]
}

Important:
- resolvedContent must contain the COMPLETE file content (not just the conflicted sections)
- All conflict markers must be removed in the resolved content
- Include one resolution entry per conflicted file
`

/** Progress information emitted during conflict resolution. */
export interface IConflictResolutionProgress {
  readonly filesResolved: number
  readonly filesTotal: number
}

/**
 * Maximum number of files to resolve in a single prompt. When the total
 * exceeds this threshold, the engine batches files into parallel chunks.
 */
const SinglePromptFileLimit = 20

/** Maximum number of chunks to resolve concurrently. */
const MaxConcurrentChunks = 5

/**
 * This store manages the Copilot client lifecycle based on the user's
 * GitHub.com account. It tracks account changes and creates the client
 * lazily when a Copilot feature is used.
 *
 * Currently, Copilot is only available for GitHub.com accounts.
 */
export class CopilotStore extends BaseStore {
  private currentAccount: Account | null = null

  private cachedModels: ReadonlyArray<ModelInfo> | null = null
  private modelsCachedAt: number = 0
  private modelsInFlight: Promise<ReadonlyArray<ModelInfo>> | null = null

  public constructor(private readonly accountsStore: AccountsStore) {
    super()
    this.accountsStore.onDidUpdate(this.onAccountsUpdated)
    this.initializeFromAccounts()
  }

  /**
   * Initialize the account from the current accounts.
   */
  private async initializeFromAccounts(): Promise<void> {
    const accounts = await this.accountsStore.getAll()
    this.onAccountsUpdated(accounts)
  }

  /**
   * Handler for account updates. Updates the stored account reference.
   */
  private onAccountsUpdated = (accounts: ReadonlyArray<Account>): void => {
    // Copilot is only available on GitHub.com, so we look for a dotcom account
    const dotComAccount = accounts.find(isDotComAccount) ?? null

    if (dotComAccount?.login !== this.currentAccount?.login) {
      this.cachedModels = null
      this.modelsCachedAt = 0
      this.modelsInFlight = null
    }

    this.currentAccount = dotComAccount

    if (dotComAccount === null) {
      log.debug('CopilotStore: No GitHub.com account available')
      this.emitUpdate()
    } else {
      log.debug(`CopilotStore: Account updated for '${dotComAccount.login}'`)
      // Proactively fetch models so they are ready when the user opens the
      // Copilot tab in Settings, even if they signed in without reopening
      // the dialog.
      this.getCachedModels().then(this.emitUpdate, this.emitUpdate)
    }
  }

  /**
   * Creates a new Copilot client for the current account.
   *
   * @throws Error if no GitHub.com account is available
   */
  private async createClient(repositoryPath?: string): Promise<CopilotClient> {
    if (this.currentAccount === null || !this.currentAccount.token) {
      throw new Error(
        'Cannot create Copilot client: No GitHub.com account available'
      )
    }

    // This relies on the fact that Copilot CLI is bundled with the app, but not
    // as a "single executable application", but the files from the npm package.
    // That means Desktop will use its own executable to run as Copilot CLI's
    // index.js as node.
    // However, when trying to do this directly without the --eval flag, Copilot
    // CLI fails to parse the arguments correctly, so we ended up using --eval
    // and just importing the index.js from the CLI as a workaround.
    const cliDir = getCopilotCLIDir()
    let importPath = join(cliDir, 'index.js')

    if (__WIN32__) {
      // On Windows, we need the import path to be a valid file:// URL.
      importPath = pathToFileURL(importPath).href
    }

    return new CopilotClient({
      cliPath: await getCopilotCLIPath(),
      cliArgs: ['--eval', `import '${importPath}'`, '--'],
      env: {
        ELECTRON_RUN_AS_NODE: '1',
        COPILOT_RUN_APP: '1',
      },
      cwd: repositoryPath,
      autoStart: true,
      githubToken: this.currentAccount.token,
    })
  }

  /**
   * Stops the given Copilot client.
   */
  private async stopClient(client: CopilotClient): Promise<void> {
    try {
      await client.stop()
    } catch (e) {
      log.error('CopilotStore: Error stopping client', e)
    }
  }

  /**
   * Generates a commit message for the given diff using Copilot.
   *
   * @param diff The diff of changes to be committed, in git format
   * @param model Optional model ID to use. If null/undefined,
   *   resolves via listModels: prefers {@link DefaultCopilotModel}, otherwise
   *   picks the cheapest available model.
   * @returns Commit details (title and description) generated by Copilot
   * @throws Error if no GitHub.com account is available or if generation fails
   */
  public async generateCommitMessage(
    diff: string,
    repositoryPath: string,
    model?: string | null
  ): Promise<ICopilotCommitMessage> {
    const cachedModels = await this.getCachedModels()
    const resolvedModel = model
      ? cachedModels.find(m => m.id === model) ?? null
      : getPreferredDefaultModel(cachedModels)

    // Use the resolved model's ID, the raw string ID the caller passed, or
    // the default model as a last resort.
    const modelId = resolvedModel?.id ?? model ?? DefaultCopilotModel

    const client = await this.createClient(repositoryPath)
    let session: Awaited<ReturnType<CopilotClient['createSession']>> | null =
      null

    try {
      const reasoningEffort = resolvedModel
        ? getLowestReasoningEffort(resolvedModel)
        : DefaultReasoningEffort

      // Create a session for commit message generation
      session = await client.createSession({
        model: modelId,
        reasoningEffort,
        systemMessage: {
          // It's important to 'append' the system prompt so that it doesn't
          // override any instructions, like copilot-instructions.md (in which
          // we rely for custom commit message generation instructions).
          mode: 'append',
          content: CommitMessageSystemPrompt,
        },
        availableTools: [],
        onPermissionRequest: async () => ({
          kind: 'denied-interactively-by-user',
        }),
      })

      // Send the diff and wait for response
      const response = await session.sendAndWait({ prompt: diff }, 30000)

      if (!response || !response.data.content) {
        throw new Error('No response from Copilot')
      }

      return parseCopilotCommitMessage(response.data.content)
    } catch (e) {
      log.warn('CopilotStore: Failed to generate commit message', e)
      throw e
    } finally {
      // Clean up the session
      await session?.destroy().catch(() => {})

      // Stop the client after use
      await this.stopClient(client)
    }
  }

  /**
   * Use the Copilot SDK to analyze conflicts and suggest resolutions.
   *
   * For small conflict sets (≤20 files) a single prompt is sent. Larger sets
   * are automatically batched into parallel chunks with up to 5 concurrent
   * requests. Each chunk is retried once on parse failure.
   *
   * @param context - The structured conflict context (files with hunks)
   * @param commitContext - Optional commit history from both sides
   * @param pullRequest - Optional pull request for enrichment
   * @param repositoryPath - Path to the repository working directory
   * @param onProgress - Optional callback for streaming progress to the UI
   * @returns The parsed conflict resolution response
   * @throws Error if no GitHub.com account is available or if resolution fails
   */
  public async resolveConflicts(
    context: ICopilotConflictContext,
    commitContext: IConflictCommitContext | null,
    pullRequest: PullRequest | null,
    repositoryPath: string,
    onProgress?: (progress: IConflictResolutionProgress) => void
  ): Promise<ICopilotConflictResolutionResponse> {
    const resolvableFiles = context.files.filter(f => !f.skippedReason)
    const filesTotal = resolvableFiles.length

    if (filesTotal === 0) {
      throw new Error('No resolvable conflicted files')
    }

    onProgress?.({ filesResolved: 0, filesTotal })

    const client = await this.createClient(repositoryPath)

    try {
      if (filesTotal <= SinglePromptFileLimit) {
        const filteredContext: ICopilotConflictContext = {
          ourLabel: context.ourLabel,
          theirLabel: context.theirLabel,
          files: resolvableFiles,
        }
        const prompt = formatConflictContextForPrompt(
          filteredContext,
          commitContext,
          pullRequest
        )
        const resolutions = await this.resolveChunk(
          client,
          prompt,
          resolvableFiles
        )
        onProgress?.({ filesResolved: filesTotal, filesTotal })
        return { resolutions }
      }

      // Batch into chunks and resolve concurrently. Smaller chunks at high
      // file counts protect output quality (less truncation/malformed JSON).
      const chunkSize = filesTotal > 100 ? 15 : 20
      const chunks = createDependencyAwareChunks(resolvableFiles, chunkSize)
      const allResolutions: Array<IFileResolution> = []
      let filesResolved = 0

      // Process chunks with bounded concurrency
      for (let i = 0; i < chunks.length; i += MaxConcurrentChunks) {
        const batch = chunks.slice(i, i + MaxConcurrentChunks)
        const batchSettled = await Promise.allSettled(
          batch.map(chunkFiles => {
            const chunkContext: ICopilotConflictContext = {
              ourLabel: context.ourLabel,
              theirLabel: context.theirLabel,
              files: chunkFiles,
            }
            const prompt = formatConflictContextForPrompt(
              chunkContext,
              commitContext,
              pullRequest
            )
            return this.resolveChunk(client, prompt, chunkFiles)
          })
        )

        // Collect results; throw the first failure after all settle
        let firstError: Error | undefined
        for (const result of batchSettled) {
          if (result.status === 'fulfilled') {
            allResolutions.push(...result.value)
            filesResolved += result.value.length
            onProgress?.({
              filesResolved,
              filesTotal,
            })
          } else if (firstError === undefined) {
            firstError =
              result.reason instanceof Error
                ? result.reason
                : new Error(String(result.reason))
          }
        }

        if (firstError !== undefined) {
          throw firstError
        }
      }

      onProgress?.({ filesResolved: filesTotal, filesTotal })
      return { resolutions: allResolutions }
    } finally {
      await this.stopClient(client)
    }
  }

  /**
   * Resolve a single chunk of files. Retries once on parse or validation
   * failure. Transport errors (timeouts, auth, session creation) fail fast.
   */
  private async resolveChunk(
    client: CopilotClient,
    prompt: string,
    expectedFiles: ReadonlyArray<IFileConflictContext>
  ): Promise<ReadonlyArray<IFileResolution>> {
    const expectedPaths = new Set(expectedFiles.map(f => f.path))
    let lastError: Error | undefined

    for (let attempt = 0; attempt < 2; attempt++) {
      let session: Awaited<ReturnType<CopilotClient['createSession']>> | null =
        null

      try {
        session = await client.createSession({
          model: 'gpt-5-mini',
          reasoningEffort: 'high',
          availableTools: [],
          systemMessage: {
            mode: 'append',
            content: ConflictResolutionSystemPrompt,
          },
          onPermissionRequest: async () => ({
            kind: 'denied-interactively-by-user',
          }),
        })

        const response = await session.sendAndWait({ prompt }, 600_000)

        if (!response || !response.data.content) {
          throw new Error('No response from Copilot')
        }

        const parsed = parseCopilotConflictResolution(response.data.content)

        // Validate returned paths match requested files
        const returnedPaths = new Set(parsed.resolutions.map(r => r.path))
        for (const path of returnedPaths) {
          if (!expectedPaths.has(path)) {
            throw new Error(
              `Copilot returned resolution for unexpected file: ${path}`
            )
          }
        }

        // Check for duplicate paths
        if (returnedPaths.size !== parsed.resolutions.length) {
          throw new Error(
            'Copilot returned duplicate file paths in resolutions'
          )
        }

        // Check that every expected file received a resolution
        const missingPaths: Array<string> = []
        for (const path of expectedPaths) {
          if (!returnedPaths.has(path)) {
            missingPaths.push(path)
          }
        }
        if (missingPaths.length > 0) {
          throw new Error(
            `Copilot did not return resolutions for: ${missingPaths.join(', ')}`
          )
        }

        return parsed.resolutions
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e))

        // Only retry on parse/validation failures — fail fast on
        // transport errors (timeouts, auth, session creation). All
        // parse/validation errors use messages starting with "Copilot
        // returned" or "Copilot did not return".
        const msg = lastError.message
        const isRetryable =
          msg.startsWith('Copilot returned') ||
          msg.startsWith('Copilot did not return')

        if (!isRetryable || attempt > 0) {
          break
        }

        log.warn(
          'CopilotStore: Conflict resolution parse/validation failed, retrying',
          e
        )
      } finally {
        await session?.destroy().catch(() => {})
      }
    }

    log.warn('CopilotStore: Failed to resolve conflicts after retry', lastError)
    throw lastError ?? new Error('Conflict resolution failed')
  }

  /**
   * Returns whether Copilot is available (i.e., a GitHub.com account is
   * signed in).
   */
  public get isAvailable(): boolean {
    return this.currentAccount !== null
  }

  /**
   * Returns the currently associated GitHub.com account, if any.
   */
  public get account(): Account | null {
    return this.currentAccount
  }

  /**
   * Returns the last-fetched model list without triggering a refresh.
   * Null if models have never been fetched.
   */
  public get cachedModelList(): ReadonlyArray<ModelInfo> | null {
    return this.cachedModels
  }

  /**
   * Lists the available Copilot models from the SDK, using a cached result if
   * it is less than {@link ModelListCacheTTL} old.
   *
   * Returns an empty array on failure or when no account is available.
   */
  public async listModels(): Promise<ReadonlyArray<ModelInfo>> {
    return this.getCachedModels()
  }

  /**
   * Returns the cached model list, refreshing it from the SDK if the cache
   * has expired.
   */
  private async getCachedModels(): Promise<ReadonlyArray<ModelInfo>> {
    if (this.currentAccount === null) {
      return []
    }

    if (
      this.cachedModels !== null &&
      Date.now() - this.modelsCachedAt < ModelListCacheTTL
    ) {
      return this.cachedModels
    }

    // Deduplicate concurrent fetches — if one is already in flight, reuse it.
    if (this.modelsInFlight !== null) {
      return this.modelsInFlight
    }

    this.modelsInFlight = this.fetchModels()
    try {
      return await this.modelsInFlight
    } finally {
      this.modelsInFlight = null
    }
  }

  private async fetchModels(): Promise<ReadonlyArray<ModelInfo>> {
    const client = await this.createClient()

    try {
      await client.start()
      const models = await client.listModels()
      this.cachedModels = models
      this.modelsCachedAt = Date.now()
      return models
    } catch (e) {
      log.warn('CopilotStore: Failed to list models', e)
      return this.cachedModels ?? []
    } finally {
      await this.stopClient(client)
    }
  }
}

/**
 * Extract exported and imported symbols from conflict hunk content for
 * dependency detection. Scans all hunk sections (ours, theirs, context)
 * to find import paths, exported names, and referenced identifiers.
 */
export function extractSymbols(file: IFileConflictContext): {
  readonly exports: ReadonlySet<string>
  readonly importPaths: ReadonlySet<string>
  readonly references: ReadonlySet<string>
} {
  const exports = new Set<string>()
  const importPaths = new Set<string>()
  const references = new Set<string>()

  const textParts: Array<string> = []
  for (const hunk of file.hunks) {
    textParts.push(
      hunk.oursContent,
      hunk.theirsContent,
      hunk.contextBefore,
      hunk.contextAfter
    )
    if (hunk.baseContent !== null) {
      textParts.push(hunk.baseContent)
    }
  }
  const content = textParts.join('\n')

  for (const m of content.matchAll(
    /export\s+(?:function|const|let|class|interface|type|enum)\s+(\w+)/g
  )) {
    exports.add(m[1])
  }

  // Match all common import forms:
  //   import { a, b } from 'x'
  //   import X from 'x'
  //   import * as X from 'x'
  //   import X, { a, b } from 'x'
  //   import type { a } from 'x'
  for (const m of content.matchAll(
    /import\s+(?:type\s+)?(?:(\*\s+as\s+\w+)|(\w+)\s*,\s*\{([^}]+)\}|\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/g
  )) {
    // m[6] is always the import path
    importPaths.add(m[6])

    // Collect referenced names from whichever capture group matched
    const parts: Array<string> = []
    if (m[1]) {
      // import * as X — extract X
      const asName = m[1].replace(/^\*\s+as\s+/, '').trim()
      if (asName) {
        parts.push(asName)
      }
    } else if (m[2] && m[3]) {
      // import Default, { named } — both
      parts.push(m[2])
      parts.push(...m[3].split(','))
    } else if (m[4]) {
      // import { named }
      parts.push(...m[4].split(','))
    } else if (m[5]) {
      // import Default
      parts.push(m[5])
    }

    for (const name of parts) {
      const trimmed = name
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0]
        .trim()
      if (trimmed) {
        references.add(trimmed)
      }
    }
  }

  for (const m of content.matchAll(
    /(?:extends|implements|instanceof|new|typeof)\s+(\w+)/g
  )) {
    references.add(m[1])
  }

  return { exports, importPaths, references }
}

/**
 * Group files that share dependencies into clusters using Union-Find,
 * then pack clusters into chunks of `targetSize`. Files that import from
 * each other or reference each other's exports stay in the same chunk
 * so the model can reason about cross-file coherence.
 */
export function createDependencyAwareChunks(
  files: ReadonlyArray<IFileConflictContext>,
  targetSize: number
): ReadonlyArray<ReadonlyArray<IFileConflictContext>> {
  if (files.length <= targetSize) {
    return [Array.from(files)]
  }

  const fileSymbols = files.map(f => ({
    ...extractSymbols(f),
    baseName: f.path.replace(/\.[^.]+$/, '').replace(/^.*\//, ''),
  }))

  // Union-Find
  const parent = new Array<number>(files.length)
  for (let i = 0; i < files.length; i++) {
    parent[i] = i
  }

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }

  function union(a: number, b: number): void {
    const pa = find(a)
    const pb = find(b)
    if (pa !== pb) {
      parent[pa] = pb
    }
  }

  for (let i = 0; i < fileSymbols.length; i++) {
    for (let j = i + 1; j < fileSymbols.length; j++) {
      const a = fileSymbols[i]
      const b = fileSymbols[j]

      // Match import paths by path-segment boundary — not bare substring —
      // to avoid false positives with short basenames like "e" or "api".
      // Strip extension and directory from import path to get its base name.
      const aImportsB = [...a.importPaths].some(
        p => p.replace(/\.[^./]+$/, '').replace(/^.*\//, '') === b.baseName
      )
      const bImportsA = [...b.importPaths].some(
        p => p.replace(/\.[^./]+$/, '').replace(/^.*\//, '') === a.baseName
      )

      let sharedSymbols = false
      if (!sharedSymbols) {
        for (const exp of a.exports) {
          if (b.references.has(exp)) {
            sharedSymbols = true
            break
          }
        }
      }
      if (!sharedSymbols) {
        for (const exp of b.exports) {
          if (a.references.has(exp)) {
            sharedSymbols = true
            break
          }
        }
      }

      if (aImportsB || bImportsA || sharedSymbols) {
        union(i, j)
      }
    }
  }

  // Collect dependency groups
  const groups = new Map<number, Array<IFileConflictContext>>()
  for (let i = 0; i < files.length; i++) {
    const root = find(i)
    let group = groups.get(root)
    if (group === undefined) {
      group = []
      groups.set(root, group)
    }
    group.push(files[i])
  }

  // Pack groups into chunks: large groups get split, small groups bin-pack
  const result: Array<Array<IFileConflictContext>> = []
  let currentBin: Array<IFileConflictContext> = []

  for (const group of groups.values()) {
    if (group.length >= targetSize) {
      if (currentBin.length > 0) {
        result.push(currentBin)
        currentBin = []
      }
      for (let i = 0; i < group.length; i += targetSize) {
        result.push(group.slice(i, i + targetSize))
      }
    } else {
      if (currentBin.length + group.length > targetSize) {
        if (currentBin.length > 0) {
          result.push(currentBin)
        }
        currentBin = [...group]
      } else {
        currentBin.push(...group)
      }
    }
  }

  if (currentBin.length > 0) {
    result.push(currentBin)
  }

  return result
}
