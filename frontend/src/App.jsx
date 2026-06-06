import { useState, useRef } from 'react'
import { Upload, FileText, X, Search, AlertTriangle } from 'lucide-react'
import ResultsSection from './components/ResultsSection.jsx'

const API_BASE = 'http://127.0.0.1:8080'
const VALID_NAMES = ['requirements.txt', 'package.json']

export default function App() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [results, setResults] = useState(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef(null)

  function handleFile(file) {
    if (!VALID_NAMES.includes(file.name)) {
      setError(`"${file.name}" is not supported. Please upload requirements.txt or package.json.`)
      return
    }
    setSelectedFile(file)
    setError(null)
    setResults(null)
  }

  function clearFile() {
    setSelectedFile(null)
    fileInputRef.current.value = ''
    setResults(null)
    setError(null)
  }

  async function runScan() {
    if (!selectedFile) return
    setError(null)
    setResults(null)
    setLoading(true)

    const formData = new FormData()
    formData.append('file', selectedFile)

    try {
      const res = await fetch(`${API_BASE}/scan`, { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `Server error (${res.status})`)
      setResults(data)
    } catch (err) {
      if (err instanceof TypeError) {
        setError(
          'Could not connect to the backend. ' +
          'Make sure uvicorn is running: cd backend && uvicorn main:app --reload --port 8080'
        )
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">

      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <div className="brand-icon">◈</div>
            <div className="brand-text">
              <h1 className="brand-name">Zero-Day Radar</h1>
              <p className="brand-sub">Automated Dependency Vulnerability Scanner</p>
            </div>
          </div>
          <div className="header-badge">Powered by OSV.dev</div>
        </div>
      </header>

      <main className="main">

        <section className="upload-section">
          <div className="upload-card">
            <h2 className="section-title">Scan Your Dependencies</h2>
            <p className="section-desc">
              Upload a <code>package.json</code> (npm) or <code>requirements.txt</code> (Python)
              file to check all your dependencies against the OSV vulnerability database.
            </p>

            <div
              className={`drop-zone${dragging ? ' drop-zone--active' : ''}`}
              onClick={() => fileInputRef.current.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false) }}
              onDrop={e => {
                e.preventDefault()
                setDragging(false)
                const file = e.dataTransfer.files[0]
                if (file) handleFile(file)
              }}
            >
              <div className="drop-zone-content">
                <div className="drop-icon">
                  <Upload size={40} strokeWidth={1.5} />
                </div>
                <p className="drop-primary">Drop your file here</p>
                <p className="drop-secondary">
                  or <span className="browse-link">click to browse</span>
                </p>
                <p className="drop-hint">
                  Accepts: <strong>package.json</strong> · <strong>requirements.txt</strong>
                </p>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.txt"
              hidden
              onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]) }}
            />

            {selectedFile && (
              <div className="file-selected">
                <FileText className="file-icon" size={16} />
                <span className="file-name">{selectedFile.name}</span>
                <button className="file-clear" onClick={clearFile} aria-label="Remove file">
                  <X size={14} />
                </button>
              </div>
            )}

            <button
              className="scan-btn"
              disabled={!selectedFile || loading}
              onClick={runScan}
            >
              <Search size={16} />
              {loading ? 'Scanning…' : 'Scan Dependencies'}
            </button>
          </div>
        </section>

        {loading && (
          <div className="loading">
            <div className="loading-ring" />
            <p className="loading-text">Querying OSV.dev vulnerability database…</p>
          </div>
        )}

        {error && (
          <div className="error-banner">
            <AlertTriangle className="error-icon" size={16} />
            <span className="error-message">{error}</span>
            <button className="error-close" onClick={() => setError(null)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        )}

        {results && <ResultsSection data={results} />}

      </main>

      <footer className="footer">
        <p>
          Vulnerability data sourced from{' '}
          <a href="https://osv.dev" target="_blank" rel="noopener">OSV.dev</a>
          {' '}· Zero-Day Radar FMP
        </p>
      </footer>

    </div>
  )
}
