const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

function getWorstSeverity(vulns) {
  for (const level of SEVERITY_ORDER) {
    if (vulns.some(v => v.severity === level)) return level
  }
  return null
}

function SeverityBadge({ severity }) {
  const sev = (severity || 'unknown').toLowerCase()
  return (
    <span className={`severity-badge severity-badge--${sev}`}>
      {severity || 'UNKNOWN'}
    </span>
  )
}

export default function VulnerableCard({ result }) {
  const { dependency: dep, vulnerabilities } = result
  const worst = getWorstSeverity(vulnerabilities)

  return (
    <div className="result-card result-card--vulnerable">
      <div className="result-header">
        <div className="result-pkg">
          <span className="pkg-name">{dep.name}</span>
          <span className="pkg-version">{dep.version}</span>
          <span className={`pkg-ecosystem pkg-ecosystem--${dep.ecosystem.toLowerCase()}`}>
            {dep.ecosystem}
          </span>
        </div>
        <div className="result-meta">
          <span className="vuln-count">
            {vulnerabilities.length}{' '}
            {vulnerabilities.length === 1 ? 'vulnerability' : 'vulnerabilities'}
          </span>
          {worst && <SeverityBadge severity={worst} />}
        </div>
      </div>

      <div className="result-body">
        {vulnerabilities.map(vuln => (
          <div className="vuln-item" key={vuln.id}>
            <div className="vuln-header">
              <span className="vuln-id">{vuln.id}</span>
              <SeverityBadge severity={vuln.severity} />
            </div>
            <p className="vuln-summary">{vuln.summary}</p>
            {vuln.fixed_version ? (
              <div className="vuln-fix">
                <span className="fix-label">Recommended fix:</span>
                <span className="fix-version">upgrade to {vuln.fixed_version}</span>
              </div>
            ) : (
              <div className="vuln-fix vuln-fix--none">
                No patched version recorded — check the package changelog manually.
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
