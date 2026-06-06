import { useState } from 'react'
import { ChevronRight, ChevronDown, Check } from 'lucide-react'

export default function SafeSection({ results }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="safe-section">
      <button className="safe-toggle" onClick={() => setOpen(o => !o)}>
        <span className="safe-toggle-icon">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
        Show {results.length} safe package{results.length !== 1 ? 's' : ''} — no known vulnerabilities found
      </button>

      {open && (
        <div className="safe-list">
          {results.map(result => {
            const dep = result.dependency
            return (
              <div className="safe-row" key={`${dep.name}@${dep.version}`}>
                <Check className="safe-check" size={13} />
                <span className="pkg-name">{dep.name}</span>
                <span className="pkg-version">{dep.version}</span>
                <span className={`pkg-ecosystem pkg-ecosystem--${dep.ecosystem.toLowerCase()}`}>
                  {dep.ecosystem}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
