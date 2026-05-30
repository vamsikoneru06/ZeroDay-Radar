<div align="center">

# ◈ Zero-Day Radar

### Automated Dependency Vulnerability Scanner

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![OSV.dev](https://img.shields.io/badge/Powered%20by-OSV.dev-4285F4?style=for-the-badge&logo=google&logoColor=white)
![Status](https://img.shields.io/badge/Status-MVP%20Complete-brightgreen?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)

*Upload a dependency file. Get a full CVE report in seconds.*

</div>

---

## What is Zero-Day Radar?

Thousands of new software vulnerabilities (CVEs) are discovered every week. Security teams struggle to know which of their applications are actually at risk.

**Zero-Day Radar** solves this by letting you drag-and-drop a `package.json` (npm) or `requirements.txt` (Python) file and instantly receive a colour-coded vulnerability report — showing every known CVE, its severity rating, and the exact version you need to upgrade to in order to fix it.

Vulnerability data is sourced in real-time from **[OSV.dev](https://osv.dev)**, Google's open-source vulnerability database, which aggregates CVEs from the NVD, GitHub Advisory Database, and dozens of other sources.

---

## Features

- **Drag-and-drop file upload** — supports `package.json` (npm) and `requirements.txt` (PyPI)
- **Real-time CVE lookup** — queries the OSV.dev batch API in a single round-trip
- **Severity classification** — colour-coded CRITICAL / HIGH / MEDIUM / LOW badges based on CVSS v3 scores
- **Remediation guidance** — shows the exact patched version to upgrade to for each CVE
- **Smart result sorting** — most critical vulnerabilities surface at the top automatically
- **Safe package collapsing** — clean packages are collapsed so vulnerabilities stay in focus
- **Zero API keys required** — OSV.dev is completely free and open

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      USER'S BROWSER                         │
│                                                             │
│   frontend/index.html  ·  style.css  ·  app.js             │
│                                                             │
│   • Drag-and-drop file upload                               │
│   • Fetch API → POST /scan                                  │
│   • Renders colour-coded CVE report                         │
└───────────────────────────┬─────────────────────────────────┘
                            │  HTTP POST /scan
                            │  multipart/form-data
                            ▼
┌─────────────────────────────────────────────────────────────┐
│               BACKEND  ·  Python / FastAPI                  │
│                                                             │
│  ┌─────────────┐   ┌──────────────┐   ┌─────────────────┐  │
│  │  main.py    │   │  parsers.py  │   │  osv_client.py  │  │
│  │             │──▶│              │──▶│                 │  │
│  │  POST /scan │   │  Extracts    │   │  Batch queries  │  │
│  │  endpoint   │   │  name +      │   │  OSV.dev API    │  │
│  │             │   │  version     │   │  via httpx      │  │
│  └─────────────┘   └──────────────┘   └────────┬────────┘  │
│                                                 │           │
└─────────────────────────────────────────────────┼───────────┘
                                                  │  HTTPS POST
                                                  ▼
                                 ┌──────────────────────────────┐
                                 │     OSV.dev  ·  api.osv.dev   │
                                 │                              │
                                 │  Returns: CVE ID, severity,  │
                                 │  description, fixed version  │
                                 └──────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | HTML5 / CSS3 / Vanilla JS | Single-page dashboard, drag-and-drop UI |
| **Backend** | Python 3.11 + FastAPI | REST API, file handling, async orchestration |
| **HTTP Client** | httpx | Async HTTP calls to OSV.dev |
| **Vulnerability DB** | OSV.dev API | Real-time CVE data (no API key needed) |
| **Data Validation** | Pydantic | Typed data models throughout the backend |
| **Server** | Uvicorn | ASGI server for FastAPI |

---

## Project Structure

```
ZeroDay-Radar/
│
├── backend/
│   ├── main.py            # FastAPI app — POST /scan endpoint
│   ├── parsers.py         # Parse package.json & requirements.txt
│   ├── osv_client.py      # Query OSV.dev batch API, extract CVE data
│   ├── models.py          # Pydantic data models (Dependency, Vulnerability, ScanResult)
│   └── requirements.txt   # Python dependencies
│
├── frontend/
│   ├── index.html         # Single-page dashboard
│   ├── style.css          # Dark cybersecurity theme
│   └── app.js             # Upload logic, fetch, results rendering, XSS prevention
│
├── sample_files/
│   ├── sample_package.json       # npm file with known-vulnerable packages for testing
│   └── sample_requirements.txt  # Python file with known-vulnerable packages for testing
│
└── README.md
```

---

## Getting Started

### Prerequisites

- Python 3.11 or higher
- A modern web browser (Chrome, Firefox, Edge)

### 1. Clone the repository

```bash
git clone https://github.com/vamsikoneru06/ZeroDay-Radar.git
cd ZeroDay-Radar
```

### 2. Set up the Python environment

```bash
# Create a virtual environment
python -m venv venv

# Activate it
# Windows:
.\venv\Scripts\Activate.ps1
# macOS / Linux:
source venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt
```

### 3. Start the backend server

```bash
cd backend
uvicorn main:app --reload
```

The API will be available at `http://127.0.0.1:8000`.
Interactive API docs (Swagger UI) are at `http://127.0.0.1:8000/docs`.

### 4. Serve the frontend

Open a second terminal and run:

```bash
cd frontend
python -m http.server 5500
```

Then open **`http://127.0.0.1:5500`** in your browser.

> **VS Code users:** Right-click `frontend/index.html` → *Open with Live Server* as an alternative.

---

## Usage

1. **Upload** — drag your `package.json` or `requirements.txt` onto the upload zone, or click to browse.
2. **Scan** — click **Scan Dependencies**.
3. **Review** — vulnerabilities appear sorted by severity (CRITICAL first). Each card shows:
   - The CVE / GHSA identifier
   - A severity badge (CRITICAL / HIGH / MEDIUM / LOW)
   - A plain-English description of the flaw
   - The exact version you need to upgrade to
4. **Safe packages** — packages with no known CVEs are collapsed at the bottom to keep the view focused.

### Testing with sample files

The `sample_files/` directory contains dependency files with **intentionally outdated packages** for demo purposes:

| File | Ecosystem | Notable vulnerable packages |
|---|---|---|
| `sample_package.json` | npm | `lodash@4.17.11`, `axios@0.21.1` |
| `sample_requirements.txt` | PyPI | `django==2.2.0`, `flask==1.0.2`, `pillow==8.1.0` |

---

## API Reference

### `GET /`
Health check.

**Response:**
```json
{ "status": "Zero-Day Radar API is running", "version": "0.2.0" }
```

### `POST /scan`
Accepts a dependency file and returns a full vulnerability report.

**Request:** `multipart/form-data` with a field named `file` containing a `requirements.txt` or `package.json`.

**Response:**
```json
{
  "filename": "requirements.txt",
  "ecosystem": "PyPI",
  "dependency_count": 5,
  "vulnerable_count": 3,
  "results": [
    {
      "dependency": { "name": "flask", "version": "1.0.2", "ecosystem": "PyPI" },
      "vulnerabilities": [
        {
          "id": "GHSA-562c-5r94-xh97",
          "summary": "Flask vulnerable to possible disclosure of permanent session cookie...",
          "severity": "HIGH",
          "fixed_version": "2.2.5"
        }
      ],
      "is_vulnerable": true
    }
  ]
}
```

**Error responses:**

| Code | Meaning |
|---|---|
| `400` | Unsupported file type or invalid JSON in `package.json` |
| `422` | File uploaded but no dependencies found |
| `502` | OSV.dev returned an error or could not be reached |
| `504` | OSV.dev request timed out |

---

## How Severity Is Determined

OSV.dev stores severity in several locations depending on the contributing database. Zero-Day Radar checks them in this priority order:

1. `database_specific.severity` — plain string (most common)
2. `ecosystem_specific.severity` — used by some PyPI entries
3. CVSS v3 numeric base score → mapped using NIST's official thresholds:

| Score | Severity |
|---|---|
| 9.0 – 10.0 | 🔴 CRITICAL |
| 7.0 – 8.9  | 🟠 HIGH |
| 4.0 – 6.9  | 🟡 MEDIUM |
| 0.1 – 3.9  | 🔵 LOW |

---

## Security Notes

- **XSS prevention** — all strings from the OSV.dev API are passed through `escapeHtml()` before being inserted into the DOM via `innerHTML`. CVE summaries from external databases are treated as untrusted input.
- **No data stored** — uploaded files are read into memory for the duration of the request and immediately discarded. Nothing is written to disk.
- **No authentication required** — this is a local development tool. If you expose it over a network, add authentication.

---

## Roadmap

- [ ] Export scan report as PDF
- [ ] Filter results by severity level
- [ ] Support `pom.xml` (Maven / Java)
- [ ] Support `go.mod` (Go modules)
- [ ] Scan history (SQLite)
- [ ] GitHub Actions integration — fail CI on CRITICAL vulnerabilities

---

## Built With

- [FastAPI](https://fastapi.tiangolo.com/) — modern Python web framework
- [OSV.dev](https://osv.dev) — open-source vulnerability database by Google
- [httpx](https://www.python-httpx.org/) — async HTTP client for Python
- [Pydantic](https://docs.pydantic.dev/) — data validation for Python

---

<div align="center">

Built as a Final Major Project in Cybersecurity.

*Zero-Day Radar — Know your risk before your attacker does.*

</div>
