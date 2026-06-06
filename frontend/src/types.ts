export interface Vulnerability {
  id: string
  summary: string
  severity: string | null
  fixed_version: string | null
}

export interface Dependency {
  name: string
  version: string
  ecosystem: string
}

export interface DependencyResult {
  dependency: Dependency
  is_vulnerable: boolean
  vulnerabilities: Vulnerability[]
}

export interface ScanData {
  filename: string
  ecosystem: string
  dependency_count: number
  vulnerable_count: number
  results: DependencyResult[]
}
