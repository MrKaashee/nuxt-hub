import { execSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { isWindows } from 'std-env'
import type { Nuxt } from '@nuxt/schema'
import { join } from 'pathe'
import { logger, addImportsDir, addServerImportsDir, addServerScanDir, createResolver } from '@nuxt/kit'
import { joinURL } from 'ufo'
import { defu } from 'defu'
import { $fetch } from 'ofetch'
import { addDevToolsCustomTabs } from './utils/devtools'
import { getCloudflareAccessHeaders } from './runtime/utils/cloudflareAccess'
import { copyDatabaseMigrationsToHubDir, copyDatabaseQueriesToHubDir } from './runtime/database/server/utils/migrations/helpers'

const log = logger.withTag('nuxt:hub')
const { resolve, resolvePath } = createResolver(import.meta.url)

export interface HubConfig {
  remote: string | boolean
  url: string
  projectUrl?: string | ((args: { env: string, branch: string }) => string)
  projectKey?: string
  projectSecretKey?: string
  userToken?: string
  env?: string
  version?: string
  cloudflareAccess?: {
    clientId: string
    clientSecret: string
  }
  workers?: boolean | undefined

  ai?: boolean
  analytics?: boolean
  blob?: boolean
  browser?: boolean
  cache?: boolean
  database?: boolean
  kv?: boolean
  vectorize?: {
    [key: string]: {
      metric: 'cosine' | 'euclidean' | 'dot-product'
      dimensions: number
      metadataIndexes?: Record<string, 'string' | 'number' | 'boolean'>
    }
  }

  bindings?: {
    compatibilityDate?: string
    compatibilityFlags?: string[]
    hyperdrive?: {
      [key: string]: string
    }
  }

  remoteManifest?: {
    version: string
    storage: {
      vectorize?: HubConfig['vectorize']
    } & Record<string, boolean>
  }

  dir?: string
  databaseMigrationsDirs?: string[]
  databaseQueriesPaths?: string[]
  openAPIRoute?: string
}

export async function setupBase(nuxt: Nuxt, hub: HubConfig) {
  // Create the hub.dir directory
  hub.dir = join(nuxt.options.rootDir, hub.dir!)
  try {
    await mkdir(hub.dir, { recursive: true })
  } catch (e: any) {
    if (e.errno === -17) {
      // File already exists
    } else {
      throw e
    }
  }

  // Add Server scanning
  addServerScanDir(resolve('./runtime/base/server'))
  addServerImportsDir([resolve('./runtime/base/server/utils'), resolve('./runtime/base/server/utils/migrations')])

  // Add custom tabs to Nuxt DevTools
  if (nuxt.options.dev) {
    addDevToolsCustomTabs(nuxt, hub)
  }

  // Add routeRules to work with some security modules
  nuxt.options.routeRules = nuxt.options.routeRules || {}
  nuxt.options.routeRules['/api/_hub/**'] = nuxt.options.routeRules['/api/_hub/**'] || {}
  // @ts-expect-error csurf is not typed here
  nuxt.options.routeRules['/api/_hub/**'].csurf = false
  nuxt.options.routeRules['/api/_hub/**'].cache = false
  nuxt.options.routeRules['/api/_hub/**'].prerender = false
  // Add X-Robots-Tag: noindex
  if (!nuxt.options.dev && hub.env === 'preview') {
    nuxt.options.routeRules['/**'] ||= {}
    nuxt.options.routeRules['/**'].headers ||= {}
    nuxt.options.routeRules['/**'].headers['X-Robots-Tag'] = 'noindex'
  }
  // Remove trailing slash for prerender routes
  nuxt.options.nitro.prerender ||= {}
  nuxt.options.nitro.prerender.autoSubfolderIndex ||= false
}

export async function setupAI(nuxt: Nuxt, hub: HubConfig) {
  // If we are in dev mode and the project is not linked, disable it
  if (nuxt.options.dev && !hub.remote && !hub.projectKey) {
    return log.warn('`hubAI()` and `hubAutoRAG()` are disabled: link a project with `npx nuxthub link` to run AI models in development mode.')
  }

  // Register auto-imports first so types are correct even when not running remotely
  addServerImportsDir(resolve('./runtime/ai/server/utils'))
  // If we are in dev mode and the project is linked, verify it
  if (nuxt.options.dev && !hub.remote && hub.projectKey) {
    try {
      await $fetch<any>(`/api/projects/${hub.projectKey}`, {
        method: 'HEAD',
        baseURL: hub.url,
        headers: {
          authorization: `Bearer ${hub.userToken}`
        }
      })
    } catch (err: any) {
      if (!err.status) {
        log.warn ('`hubAI()` and `hubAutoRAG()` are disabled: it seems that you are offline.')
      } else if (err.status === 401) {
        log.warn ('`hubAI()` and `hubAutoRAG()` are disabled: you are not logged in, make sure to run `npx nuxthub login`.')
      } else {
        log.error('`hubAI()` and `hubAutoRAG()` are disabled: failed to fetch linked project `' + hub.projectKey + '` on NuxtHub, make sure to run `npx nuxthub link` again.')
      }
      return
    }
  }
  // Add Server scanning
  addServerScanDir(resolve('./runtime/ai/server'))
}

export function setupAnalytics(_nuxt: Nuxt) {
  // Add Server scanning
  addServerScanDir(resolve('./runtime/analytics/server'))
  addServerImportsDir(resolve('./runtime/analytics/server/utils'))
}

export function setupBlob(_nuxt: Nuxt) {
  // Add Server scanning
  addServerScanDir(resolve('./runtime/blob/server'))
  addServerImportsDir(resolve('./runtime/blob/server/utils'))

  // Add Composables
  addImportsDir(resolve('./runtime/blob/app/composables'))
}

export async function setupBrowser(nuxt: Nuxt) {
  // Register auto-imports first so types are correct even when not running remotely
  addServerImportsDir(resolve('./runtime/browser/server/utils'))
  // Check if dependencies are installed
  const missingDeps = []
  try {
    const pkg = '@cloudflare/puppeteer'
    await import(pkg)
  } catch (err) {
    missingDeps.push('@cloudflare/puppeteer')
  }
  if (nuxt.options.dev) {
    try {
      const pkg = 'puppeteer'
      await import(pkg)
    } catch (err) {
      missingDeps.push('puppeteer')
    }
  }
  if (missingDeps.length > 0) {
    console.error(`Missing dependencies for \`hubBrowser()\`, please install with:\n\n\`npx nypm i ${missingDeps.join(' ')}\``)
    process.exit(1)
  }
  // Add Server scanning
  // addServerScanDir(resolve('./runtime/browser/server'))
}

export async function setupCache(nuxt: Nuxt) {
  // Add Server caching (Nitro)
  let driver = await resolvePath('./runtime/cache/driver')
  if (isWindows) {
    driver = pathToFileURL(driver).href
  }
  nuxt.options.nitro = defu(nuxt.options.nitro, {
    storage: {
      cache: {
        driver,
        binding: 'CACHE'
      }
    },
    devStorage: {
      cache: nuxt.options.dev
        // if local development, use KV binding so it respect TTL
        ? {
            driver,
            binding: 'CACHE'
          }
        : {
            // Used for pre-rendering
            driver: 'fs',
            base: join(nuxt.options.rootDir, '.data/cache')
          }
    }
  })

  // Add Server scanning
  addServerScanDir(resolve('./runtime/cache/server'))
}

export async function setupDatabase(nuxt: Nuxt, hub: HubConfig) {
  // Add Server scanning
  addServerScanDir(resolve('./runtime/database/server'))
  addServerImportsDir(resolve('./runtime/database/server/utils'))
  // Bind `useDatabase()` to `hubDatabase()` if experimental.database is true
  if (nuxt.options.nitro.experimental?.database) {
    // @ts-expect-error cannot respect the typed database configs
    nuxt.options.nitro.database = defu(nuxt.options.nitro.database, {
      default: {
        connector: 'cloudflare-d1',
        options: { bindingName: 'DB' }
      }
    })
  }
  // Handle migrations
  nuxt.hook('modules:done', async () => {
    // Call hub:database:migrations:dirs hook
    await nuxt.callHook('hub:database:migrations:dirs', hub.databaseMigrationsDirs!)
    // Copy all migrations files to the hub.dir directory
    await copyDatabaseMigrationsToHubDir(hub)
    // Call hub:database:migrations:queries hook
    await nuxt.callHook('hub:database:queries:paths', hub.databaseQueriesPaths!)
    await copyDatabaseQueriesToHubDir(hub)
  })
}

export function setupKV(_nuxt: Nuxt) {
  // Add Server scanning
  addServerScanDir(resolve('./runtime/kv/server'))
  addServerImportsDir(resolve('./runtime/kv/server/utils'))
}

export function setupVectorize(nuxt: Nuxt, hub: HubConfig) {
  // Register auto-imports first so types are correct even when not running remotely
  addServerImportsDir(resolve('./runtime/vectorize/server/utils'))
  if (nuxt.options.dev && !hub.remote) {
    log.warn('`hubVectorize()` is disabled: only supported with remote storage in development mode (`nuxt dev --remote`).')
    return
  }
  // Add Server scanning
  addServerScanDir(resolve('./runtime/vectorize/server'))
}

export function vectorizeRemoteCheck(hub: HubConfig) {
  let isIndexConfigurationChanged = false
  const localVectorize = hub.vectorize || {}
  const remoteVectorize = hub.remoteManifest?.storage.vectorize || {}

  Object.keys(localVectorize).forEach((key) => {
    // Index does not exist in remote project yet
    if (!remoteVectorize[key]) {
      return
    }
    const isDimensionsChanged = localVectorize[key].dimensions !== remoteVectorize[key].dimensions
    const isMetricChanged = localVectorize[key].metric !== remoteVectorize[key].metric
    if (isDimensionsChanged || isMetricChanged) {
      log.warn(`Vectorize index \`${key}\` configuration changed\nRemote: \`${remoteVectorize[key].dimensions}\` dimensions - \`${remoteVectorize[key].metric}\` metric \nLocal: \`${localVectorize[key].dimensions}\` dimensions - \`${localVectorize[key].metric}\` metric`)
      isIndexConfigurationChanged = true
    }
  })

  if (isIndexConfigurationChanged) {
    log.warn('Modified Vectorize index(es) will be recreated with new configuration on deployment and existing data will not be migrated!')
  }
}

export function setupOpenAPI(nuxt: Nuxt, hub: HubConfig) {
  nuxt.options.nitro ||= {}
  nuxt.options.nitro.openAPI ||= {}
  nuxt.options.nitro.openAPI.production ||= 'runtime'
  nuxt.options.nitro.openAPI.route ||= '/api/_hub/openapi.json'
  nuxt.options.nitro.openAPI.ui ||= {}
  if (nuxt.options.dev) {
    nuxt.options.nitro.openAPI.ui.scalar = {
      route: '/api/_hub/scalar'
    }
  }
  nuxt.options.nitro.openAPI.ui.swagger ||= false
  hub.openAPIRoute = nuxt.options.nitro.openAPI.route
  addServerScanDir(resolve('./runtime/openapi/server'))
}

export async function setupRemote(_nuxt: Nuxt, hub: HubConfig) {
  let env = hub.remote
  // Guess the environment from the branch name if env is 'true'
  let branch = 'main'
  if (String(env) === 'true') {
    try {
      branch = execSync('git branch --show-current', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
      env = (branch === 'main' ? 'production' : 'preview')
    } catch {
      // ignore
      log.warn('Could not guess the environment from the branch name, using `production` as default')
      env = 'production'
    }
  }

  // If projectUrl is a function and we cannot know the productionBranch
  if (typeof hub.projectUrl === 'function' && !hub.projectKey) {
    // @ts-expect-error issue with defu transform
    hub.projectUrl = hub.projectUrl({ env, branch })
  }

  // Check if the project is linked to a NuxtHub project
  // it should have a projectKey and a userToken
  // Then we fill the projectUrl
  if (hub.projectKey) {
    if (hub.projectSecretKey) {
      log.warn('Ignoring `NUXT_HUB_PROJECT_SECRET_KEY` as `NUXT_HUB_PROJECT_KEY` is set.')
    }

    const project = await $fetch<any>(`/api/projects/${hub.projectKey}`, {
      baseURL: hub.url,
      headers: {
        authorization: `Bearer ${hub.userToken}`
      }
    }).catch((err) => {
      log.debug(err)
      if (!err.status) {
        log.error('It seems that you are offline.')
      } else if (err.status === 401) {
        log.error('It seems that you are not logged in, make sure to run `npx nuxthub login`.')
      } else {
        log.error('Failed to fetch linked project on NuxtHub, make sure to run `npx nuxthub link` again.')
      }
      process.exit(1)
    })

    // Overwrite userToken with userProjectToken
    if (project.userProjectToken) {
      hub.userToken = project.userProjectToken
    }

    // Adapt env based on project defined production branch
    if (project.type === 'pages') {
      if (String(hub.remote) === 'true') {
        env = (branch === project.productionBranch ? 'production' : 'preview')
      } else {
        env = String(hub.remote)
      }
    } else {
      const environment = await determineEnvironment(hub, hub.projectKey, branch)
      env = environment.name
      hub.projectUrl = environment.url
    }

    if (typeof hub.projectUrl === 'function') {
      hub.projectUrl = hub.projectUrl({ env, branch })
    }

    const adminUrl = joinURL(hub.url, project.teamSlug, project.slug)
    log.info(`Linked to \`${adminUrl}\``)
    log.info(`Using \`${env}\` environment`)
    hub.projectUrl = hub.projectUrl || (env === 'production' ? project.url : project.previewUrl)
    // No production or preview URL found
    if (!hub.projectUrl) {
      log.error(`No deployment found for \`${env}\`, make sure to deploy the project using \`npx nuxthub deploy\`.`)
      process.exit(1)
    }
    // Update hub.env in runtimeConfig
    hub.env = env
  }

  // Make sure we have a projectUrl when using the remote option
  if (!hub.projectUrl) {
    log.error('No project URL defined, make sure to link your project with `npx nuxthub link` or add the deployed URL as `NUXT_HUB_PROJECT_URL` environment variable (if self-hosted).')
    process.exit(1)
  }

  // Make sure we have a secret when using the remote option
  if (!hub.projectKey && !hub.projectSecretKey && !hub.userToken) {
    log.error('No project secret key found, make sure to add the `NUXT_HUB_PROJECT_SECRET_KEY` environment variable.')
    process.exit(1)
  }

  // If using the remote option with a projectUrl and a projectSecretKey
  log.info(`Using remote storage from \`${hub.projectUrl}\``)
  const remoteManifest = hub.remoteManifest = await $fetch<HubConfig['remoteManifest']>('/api/_hub/manifest', {
    baseURL: hub.projectUrl as string,
    headers: {
      authorization: `Bearer ${hub.projectSecretKey || hub.userToken}`,
      ...getCloudflareAccessHeaders(hub.cloudflareAccess)
    }
  })
    .catch(async (err) => {
      log.debug(err)
      let message = 'Project not found.\nMake sure to deploy the project using `npx nuxthub deploy` or add the deployed URL as `NUXT_HUB_PROJECT_URL` environment variable.'
      if (err.status >= 500) {
        message = 'Internal server error'
      } else if (err.status === 401) {
        message = 'Authorization failed.\nMake sure to provide a valid NUXT_HUB_PROJECT_SECRET_KEY or being logged in with `npx nuxthub login`'

        if (hub.cloudflareAccess?.clientId && hub.cloudflareAccess?.clientSecret) {
          message += ', and ensure the provided NUXT_HUB_CLOUDFLARE_ACCESS_CLIENT_ID and NUXT_HUB_CLOUDFLARE_ACCESS_CLIENT_SECRET are valid.'
        }
      }
      log.error(`Failed to fetch remote storage: ${message}`)
      process.exit(1)
    })

  if (remoteManifest?.version !== hub.version) {
    log.warn(`\`${hub.projectUrl}\` is running \`@nuxthub/core@${remoteManifest?.version}\` while the local project is running \`@nuxthub/core@${hub.version}\`. Make sure to use the same version on both sides for a smooth experience.`)
  }

  Object.keys(remoteManifest?.storage || {}).filter(k => hub[k as keyof typeof hub] && !remoteManifest?.storage[k]).forEach((k) => {
    if (!remoteManifest?.storage[k]) {
      log.warn(`Remote storage \`${k}\` is enabled locally but it's not enabled in the remote project. Deploy a new version with \`${k}\` enabled to use it remotely.`)
    }
  })

  const availableStorages = Object.keys(remoteManifest?.storage || {}).filter((k) => {
    if (k === 'vectorize') {
      return Object.keys(hub.vectorize ?? {}).length && Object.keys(remoteManifest!.storage.vectorize!).length
    }
    return hub[k as keyof typeof hub] && remoteManifest?.storage[k]
  })

  if (availableStorages.length > 0) {
    const storageDescriptions = availableStorages.map((storage) => {
      if (storage === 'vectorize') {
        const indexes = Object.keys(remoteManifest!.storage.vectorize!).join(', ')
        return `\`${storage} (${indexes})\``
      }
      return `\`${storage}\``
    })
    logger.info(`Remote storage available: ${storageDescriptions.join(', ')}`)
  } else {
    log.fatal('No remote storage available: make sure to enable at least one of the storage options in your `nuxt.config.ts` and deploy new version before using remote storage. Read more at https://hub.nuxt.com/docs/getting-started/remote-storage')
    process.exit(1)
  }
}

/**
 * Determine the deployment environment based on the branch name for Workers projects
 * @param {HubConfig} hub - The Hub configuration
 * @param {string} projectKey - The project key
 * @param {string} branch - The git branch name
 * @returns {Promise} The determined environment
 */
export async function determineEnvironment(hub: HubConfig, projectKey: string, branch: string): Promise<{
  name: string
  description: string | null
  url: string | null
  branch: string | null
  branchMatchStrategy: string
  createdAt: Date
  lastDeployedAt: Date | null
}> {
  try {
    return await $fetch(`/api/projects/${projectKey}/environments/determine?branch=${branch}`, {
      method: 'GET',
      baseURL: hub.url,
      headers: {
        authorization: `Bearer ${hub.userToken}`
      }
    })
  } catch (error) {
    // If API call fails, default to preview
    log.error('Failed to determine environment:', error)
    process.exit(1)
  }
}
