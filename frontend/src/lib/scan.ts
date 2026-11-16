// Browser-side scanner: parses the manifest and queries OSV.dev directly,
// so the site works as static files with no backend.
import type { Dependency, DependencyResult, ScanData, Vulnerability } from "@/types"

const OSV = "https://api.osv.dev/v1"
const MAX_BYTES = 512 * 1024
const MAX_DEPS = 300
const DETAIL_CONCURRENCY = 16
const REQUEST_TIMEOUT_MS = 10_000

// ── Parsers ───────────────────────────────────────────────────────────────────

export function parseRequirementsTxt(content: string): Dependency[] {
  const deps: Dependency[] = []
  for (const raw of content.split(/\r?\n/)) {
    let line = raw.trim()
    // Blank lines, comments, pip directives (-r, --index-url), VCS/URL installs
    if (!line || line.startsWith("#") || line.startsWith("-")) continue
    if (/^(git\+|https?:\/\/|svn\+|hg\+)/.test(line)) continue
    // Drop inline comments and environment markers
    line = line.split("#")[0].split(";")[0].trim()

    const name = line.match(/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?/)?.[0]
    if (!name) continue
    const version = line.match(/[=~<>!]+\s*([0-9][A-Za-z0-9._-]*)/)?.[1] ?? "unspecified"
    deps.push({ name, version, ecosystem: "PyPI" })
  }
  return deps
}

export function parsePackageJson(content: string): Dependency[] {
  let data: { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> }
  try {
    data = JSON.parse(content)
  } catch (e) {
    throw new Error(`Invalid JSON in package.json: ${(e as Error).message}`)
  }
  const all = { ...data?.dependencies, ...data?.devDependencies }
  return Object.entries(all).map(([name, raw]) => {
    const version = String(raw).replace(/^[\^~>=<\s]+/, "").trim()
    // "latest", "file:../x", git URLs etc. have no version OSV can match
    return { name, version: /^\d/.test(version) ? version : "unspecified", ecosystem: "npm" }
  })
}

// ── Severity ──────────────────────────────────────────────────────────────────

const LABELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]

function normLabel(raw: unknown): string | null {
  const s = String(raw ?? "").toUpperCase()
  const label = s === "MODERATE" ? "MEDIUM" : s   // GitHub advisories say MODERATE
  return LABELS.includes(label) ? label : null
}

function scoreToLabel(score: number): string | null {
  if (score >= 9) return "CRITICAL"
  if (score >= 7) return "HIGH"
  if (score >= 4) return "MEDIUM"
  if (score > 0) return "LOW"
  return null
}

// CVSS v3.x base score from a vector like CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
function cvss3Score(vector: string): number | null {
  if (!/^CVSS:3\.\d\//.test(vector)) return null
  const m: Record<string, string> = Object.fromEntries(
    vector.split("/").slice(1).map(p => p.split(":")),
  )
  const cia: Record<string, number> = { N: 0, L: 0.22, H: 0.56 }
  const changed = m.S === "C"
  const iss = 1 - (1 - (cia[m.C] ?? 0)) * (1 - (cia[m.I] ?? 0)) * (1 - (cia[m.A] ?? 0))
  const impact = changed ? 7.52 * (iss - 0.029) - 3.25 * (iss - 0.02) ** 15 : 6.42 * iss
  if (impact <= 0) return 0

  const pr: Record<string, number> = changed ? { N: 0.85, L: 0.68, H: 0.5 } : { N: 0.85, L: 0.62, H: 0.27 }
  const exploitability =
    8.22 *
    ({ N: 0.85, A: 0.62, L: 0.55, P: 0.2 }[m.AV] ?? 0.85) *
    ({ L: 0.77, H: 0.44 }[m.AC] ?? 0.77) *
    (pr[m.PR] ?? 0.85) *
    ({ N: 0.85, R: 0.62 }[m.UI] ?? 0.85)

  const raw = Math.min(changed ? 1.08 * (impact + exploitability) : impact + exploitability, 10)
  return Math.ceil(raw * 10) / 10
}

// OSV stores severity in different places depending on the source database.
function extractSeverity(v: any): string | null {
  const direct = normLabel(v.database_specific?.severity)
  if (direct) return direct

  for (const a of v.affected ?? []) {
    const eco = normLabel(a.ecosystem_specific?.severity)
    if (eco) return eco
  }

  for (const s of v.severity ?? []) {
    const numeric = Number(s?.score)
    const score = Number.isFinite(numeric) ? numeric : cvss3Score(String(s?.score ?? ""))
    if (score !== null) return scoreToLabel(score)
  }

  const cvss = Number(v.database_specific?.cvss_score)
  return Number.isFinite(cvss) ? scoreToLabel(cvss) : null
}

// ── Fixed version ─────────────────────────────────────────────────────────────

const normName = (name: string, ecosystem: string) =>
  ecosystem === "PyPI" ? name.toLowerCase().replace(/[-_.]+/g, "-") : name.toLowerCase()

// Rough ordering on the numeric parts — enough to pick the nearest upgrade.
function cmpVersion(a: string, b: string): number {
  const pa = a.split(/[^0-9]+/).filter(Boolean).map(Number)
  const pb = b.split(/[^0-9]+/).filter(Boolean).map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}

// The lowest fixed release above the installed version, for this package only.
// (An advisory can cover several packages and several release branches.)
function extractFixedVersion(v: any, dep: Dependency): string | null {
  const fixes: string[] = []
  for (const a of v.affected ?? []) {
    if (a.package?.ecosystem !== dep.ecosystem) continue
    if (normName(a.package?.name ?? "", dep.ecosystem) !== normName(dep.name, dep.ecosystem)) continue
    for (const r of a.ranges ?? []) {
      if (r.type === "GIT") continue   // "fixed" is a commit hash there
      for (const e of r.events ?? []) if (e.fixed) fixes.push(e.fixed)
    }
  }
  if (!fixes.length) return null
  const newer = fixes.filter(f => cmpVersion(f, dep.version) > 0).sort(cmpVersion)
  return newer[0] ?? fixes[0]
}

// ── OSV.dev ───────────────────────────────────────────────────────────────────

// Individual requests to OSV occasionally hang or fail, so each one gets a
// short timeout and a couple of retries before the error is surfaced.
async function osv(path: string, body?: unknown) {
  let failure = "Can't reach OSV.dev. Check your internet connection and try again."
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${OSV}${path}`, {
        method: body ? "POST" : "GET",
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (res.ok) return await res.json()
      failure = `OSV.dev returned an error: ${res.status}. Please try again.`
      if (res.status < 500 && res.status !== 429) break   // retrying won't help
    } catch {
      // network error or timeout — retry
    }
  }
  throw new Error(failure)
}

// The batch endpoint returns only IDs, so each advisory is fetched separately.
// An advisory that still fails after retries is left out of the map rather
// than failing the whole scan.
async function fetchAdvisories(ids: string[], onProgress?: (fraction: number) => void): Promise<Map<string, any>> {
  const out = new Map()
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++]
      try {
        out.set(id, await osv(`/vulns/${encodeURIComponent(id)}`))
      } catch {
        // reported as "details unavailable" by the caller
      }
      onProgress?.(++done / ids.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(DETAIL_CONCURRENCY, ids.length) }, worker))
  return out
}

// ── Duplicate advisories ──────────────────────────────────────────────────────
// OSV returns the same vulnerability once per source database (for example a
// GHSA record and a PYSEC record that both alias one CVE). Records linked
// through `aliases` are grouped (union-find) and reported as one finding.

function groupByAlias(ids: string[], advisories: Map<string, any>): string[][] {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    const p = parent.get(x)
    if (p === undefined || p === x) return x
    const root = find(p)
    parent.set(x, root)
    return root
  }
  for (const id of ids)
    for (const alias of advisories.get(id)?.aliases ?? []) parent.set(find(alias), find(id))

  const groups = new Map<string, string[]>()
  for (const id of ids) {
    const root = find(id)
    groups.set(root, [...(groups.get(root) ?? []), id])
  }
  return [...groups.values()]
}

function mergeGroup(ids: string[], advisories: Map<string, any>, dep: Dependency): Vulnerability {
  // Lead with a record that has a proper title; fill gaps from its duplicates.
  const id = ids.find(i => advisories.get(i)?.summary) ?? ids[0]
  const v = advisories.get(id)
  if (!v) return { id, summary: "Details could not be loaded from OSV.dev.", severity: null, fixed_version: null }

  const records = ids.map(i => advisories.get(i)).filter(Boolean)
  const severities = records.map(extractSeverity)
  return {
    id,
    summary: String(v.summary || v.details || "No description available.").slice(0, 300),
    // Sources can disagree; report the highest rating any of them gives.
    severity: LABELS.find(l => severities.includes(l)) ?? null,
    fixed_version:
      extractFixedVersion(v, dep) ?? records.map(r => extractFixedVersion(r, dep)).find(Boolean) ?? null,
  }
}

// ── Public entry point ────────────────────────────────────────────────────────

/** onProgress receives 0–1 as advisory details are loaded. */
export async function scanFile(file: File, onProgress?: (fraction: number) => void): Promise<ScanData> {
  if (file.size > MAX_BYTES) throw new Error("File too large. Maximum allowed size is 512 KB.")

  const content = await file.text()
  const isNpm = file.name === "package.json"
  const deps = isNpm ? parsePackageJson(content) : parseRequirementsTxt(content)

  if (!deps.length) throw new Error("No dependencies were found in the uploaded file.")
  if (deps.length > MAX_DEPS)
    throw new Error(`Too many dependencies (${deps.length} found). Maximum supported is ${MAX_DEPS}.`)

  // Without a version OSV returns every historical advisory, which is noise —
  // those dependencies are reported as clean, after the ones we could check.
  const queryable = deps.filter(d => d.version !== "unspecified")
  const unqueryable = deps.filter(d => d.version === "unspecified")

  let idsPerDep: string[][] = []
  if (queryable.length) {
    const batch = await osv("/querybatch", {
      queries: queryable.map(d => ({ version: d.version, package: { name: d.name, ecosystem: d.ecosystem } })),
    })
    idsPerDep = queryable.map((_, i) =>
      (batch.results?.[i]?.vulns ?? []).map((v: { id: string }) => v.id),
    )
  }
  const advisories = await fetchAdvisories([...new Set(idsPerDep.flat())], onProgress)

  const results: DependencyResult[] = queryable.map((dep, i) => {
    const vulnerabilities = groupByAlias(idsPerDep[i], advisories).map(ids => mergeGroup(ids, advisories, dep))
    return { dependency: dep, vulnerabilities, is_vulnerable: vulnerabilities.length > 0 }
  })
  for (const dep of unqueryable) results.push({ dependency: dep, vulnerabilities: [], is_vulnerable: false })

  return {
    filename: file.name,
    ecosystem: isNpm ? "npm" : "PyPI",
    dependency_count: deps.length,
    vulnerable_count: results.filter(r => r.is_vulnerable).length,
    results,
  }
}
