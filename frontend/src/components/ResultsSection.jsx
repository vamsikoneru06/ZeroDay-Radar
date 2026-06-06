import { ShieldCheck } from 'lucide-react'
import VulnerableCard from './VulnerableCard.jsx'
import SafeSection from './SafeSection.jsx'

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

function getWorstSeverity(vulns) {
  for (const level of SEVERITY_ORDER) {
    if (vulns.some(v => v.severity === level)) return level
  }
  return null
}

function sortResults(results) {
  return [...results].sort((a, b) => {
    if (a.is_vulnerable !== b.is_vulnerable) return a.is_vulnerable ? -1 : 1
    if (a.is_vulnerable && b.is_vulnerable) {
      const aIdx = SEVERITY_ORDER.indexOf(getWorstSeverity(a.vulnerabilities))
      const bIdx = SEVERITY_ORDER.indexOf(getWorstSeverity(b.vulnerabilities))
      return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx)
    }
    return 0
  })
}

export default function ResultsSection({ data }) {
  const sorted = sortResults(data.results)
  const vulnerableResults = sorted.filter(r => r.is_vulnerable)
  const safeResults = sorted.filter(r => !r.is_vulnerable)
  const safeCount = data.dependency_count - data.vulnerable_count

  return (
    <section className="results-section">
      <div className="summary-bar">
        <div className="summary-title-row">
          <h2 className="section-title">Scan Report</h2>
          <p className="scan-meta">{data.filename} · {data.ecosystem}</p>
        </div>
        <div className="summary-chips">
          <div className="chip chip--total">
            <span className="chip-value">{data.dependency_count}</span>
            <span className="chip-label">Packages Scanned</span>
          </div>
          <div className="chip chip--vuln">
            <span className="chip-value">{data.vulnerable_count}</span>
            <span className="chip-label">Vulnerable</span>
          </div>
          <div className="chip chip--safe">
            <span className="chip-value">{safeCount}</span>
            <span className="chip-label">Safe</span>
          </div>
        </div>
      </div>

      {data.vulnerable_count === 0 && (
        <div className="all-clear">
          <div className="all-clear-icon">
            <ShieldCheck size={40} />
          </div>
          <h3 className="all-clear-title">All Clear</h3>
          <p className="all-clear-desc">
            No known vulnerabilities found across all your dependencies.
          </p>
        </div>
      )}

      <div className="results-list">
        {vulnerableResults.map(result => (
          <VulnerableCard
            key={`${result.dependency.name}@${result.dependency.version}`}
            result={result}
          />
        ))}
        {safeResults.length > 0 && <SafeSection results={safeResults} />}
      </div>
    </section>
  )
}
