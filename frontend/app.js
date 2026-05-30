// ── Configuration ────────────────────────────────────────────────────────────
// Change this if your FastAPI server runs on a different host or port.
const API_BASE = 'http://127.0.0.1:8000';

// ── DOM References ────────────────────────────────────────────────────────────
// We grab all elements we'll need once at startup. This is faster than calling
// getElementById repeatedly inside event handlers, and makes the code easier
// to read because all DOM dependencies are declared in one place.
const dropZone      = document.getElementById('drop-zone');
const browseLink    = document.getElementById('browse-link');
const fileInput     = document.getElementById('file-input');
const fileSelected  = document.getElementById('file-selected');
const fileNameEl    = document.getElementById('file-name');
const fileClearBtn  = document.getElementById('file-clear');
const scanBtn       = document.getElementById('scan-btn');
const loadingEl     = document.getElementById('loading');
const errorBanner   = document.getElementById('error-banner');
const errorMsgEl    = document.getElementById('error-message');
const errorCloseBtn = document.getElementById('error-close');
const resultsSection = document.getElementById('results-section');
const chipTotal     = document.getElementById('chip-total');
const chipVuln      = document.getElementById('chip-vuln');
const chipSafe      = document.getElementById('chip-safe');
const scanMetaEl    = document.getElementById('scan-meta');
const allClearEl    = document.getElementById('all-clear');
const resultsListEl = document.getElementById('results-list');

// ── Application State ─────────────────────────────────────────────────────────
// A single variable tracks which file the user has selected. When it is null,
// the Scan button is disabled. When set, the button becomes active.
let selectedFile = null;

// ── File Selection Logic ──────────────────────────────────────────────────────

// Clicking anywhere in the drop zone (or the "browse" link) opens the file picker.
dropZone.addEventListener('click', () => fileInput.click());
browseLink.addEventListener('click', (e) => {
    e.stopPropagation(); // prevent the click from bubbling up to the drop zone
    fileInput.click();
});

// Drag-and-drop events:
//   dragover — fires continuously while a dragged item is over the target.
//              e.preventDefault() is required to allow dropping (without it,
//              the browser cancels the drop by default).
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drop-zone--active');
});

//   dragleave — fires when the drag exits the target element.
dropZone.addEventListener('dragleave', (e) => {
    // Only remove the active class if we've actually left the drop zone,
    // not just moved into a child element.
    if (!dropZone.contains(e.relatedTarget)) {
        dropZone.classList.remove('drop-zone--active');
    }
});

//   drop — fires when the user releases the mouse. We extract the first
//          file from the DataTransfer object and hand it to setFile().
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drop-zone--active');
    const file = e.dataTransfer.files[0];
    if (file) setFile(file);
});

// Standard file-input change handler — fires when the user picks a file
// through the OS file picker dialog.
fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) setFile(fileInput.files[0]);
});

// The ✕ button next to the selected filename resets everything.
fileClearBtn.addEventListener('click', clearFile);

/**
 * Validates and registers a file for scanning.
 * Called from both drag-drop and the file picker.
 */
function setFile(file) {
    const validNames = ['requirements.txt', 'package.json'];

    // Client-side validation — gives instant feedback before any server call.
    // The server also validates, but we catch obvious mistakes here first.
    if (!validNames.includes(file.name)) {
        showError(
            `"${file.name}" is not a supported file. ` +
            `Please upload a file named requirements.txt or package.json.`
        );
        return;
    }

    selectedFile = file;
    fileNameEl.textContent = file.name;
    fileSelected.hidden = false;
    scanBtn.disabled = false;
    hideError();
    hideResults();
}

function clearFile() {
    selectedFile = null;
    fileInput.value = ''; // Reset the input so the same file can be re-selected
    fileSelected.hidden = true;
    scanBtn.disabled = true;
    hideResults();
    hideError();
}

// ── Scan Logic ────────────────────────────────────────────────────────────────

scanBtn.addEventListener('click', runScan);

async function runScan() {
    if (!selectedFile) return;

    // Reset UI to a clean "in progress" state
    hideError();
    hideResults();
    showLoading();
    scanBtn.disabled = true;

    // FormData is the standard way to send files over HTTP.
    // It encodes the file as multipart/form-data, which is exactly what
    // FastAPI's UploadFile parameter expects.
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
        const response = await fetch(`${API_BASE}/scan`, {
            method: 'POST',
            body: formData,
            // Note: do NOT set Content-Type here. When using FormData, the
            // browser must set it automatically so it includes the boundary
            // string that separates multipart sections. Setting it manually
            // breaks parsing on the server side.
        });

        // Parse the JSON body whether it's a success or an error response —
        // FastAPI returns JSON error details in the body too.
        const data = await response.json();

        if (!response.ok) {
            // HTTP 4xx/5xx — data.detail is the message from our HTTPException
            throw new Error(data.detail || `Unexpected server error (${response.status})`);
        }

        renderResults(data);

    } catch (err) {
        // TypeError with "Failed to fetch" means the browser couldn't connect
        // at all — the most common cause is the FastAPI server not running.
        if (err instanceof TypeError) {
            showError(
                'Could not connect to the backend. ' +
                'Make sure the FastAPI server is running: ' +
                'cd backend && uvicorn main:app --reload'
            );
        } else {
            showError(err.message);
        }
    } finally {
        // 'finally' runs whether the try succeeded or the catch fired.
        // We always want to hide loading and re-enable the button.
        hideLoading();
        scanBtn.disabled = false;
    }
}

// ── Results Rendering ─────────────────────────────────────────────────────────

// The severity level order from most to least severe.
// We use the index of an item in this array as its "sort key".
const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

/**
 * Returns the worst (highest-severity) vulnerability level found in a list.
 * Returns null if none of the vulns have a recognised severity.
 */
function getWorstSeverity(vulns) {
    for (const level of SEVERITY_ORDER) {
        if (vulns.some(v => v.severity === level)) return level;
    }
    return null;
}

/**
 * Sorts results so that:
 *   1. Vulnerable packages come before safe packages.
 *   2. Within vulnerable packages, CRITICAL comes before HIGH, etc.
 *   3. Safe packages are grouped at the end in their original order.
 */
function sortResults(results) {
    return [...results].sort((a, b) => {
        // Rule 1: vulnerable before safe
        if (a.is_vulnerable !== b.is_vulnerable) {
            return a.is_vulnerable ? -1 : 1;
        }
        // Rule 2: within vulnerable, sort by worst severity
        if (a.is_vulnerable && b.is_vulnerable) {
            const aIdx = SEVERITY_ORDER.indexOf(getWorstSeverity(a.vulnerabilities));
            const bIdx = SEVERITY_ORDER.indexOf(getWorstSeverity(b.vulnerabilities));
            // indexOf returns -1 if not found; treat -1 as "after all known severities"
            const aOrder = aIdx === -1 ? 99 : aIdx;
            const bOrder = bIdx === -1 ? 99 : bIdx;
            return aOrder - bOrder;
        }
        return 0; // preserve original order for safe packages
    });
}

/**
 * Takes the full API response object and renders the results section.
 * This is the main rendering function — it calls helper builders for each part.
 */
function renderResults(data) {
    const sorted = sortResults(data.results);
    const safeCount = data.dependency_count - data.vulnerable_count;

    // Update the three summary chips
    chipTotal.textContent = data.dependency_count;
    chipVuln.textContent  = data.vulnerable_count;
    chipSafe.textContent  = safeCount;
    scanMetaEl.textContent = `${data.filename} · ${data.ecosystem}`;

    // Show the all-clear banner only if zero packages are vulnerable
    allClearEl.hidden = data.vulnerable_count > 0;

    // Clear any previous results
    resultsListEl.innerHTML = '';

    const vulnerableResults = sorted.filter(r => r.is_vulnerable);
    const safeResults       = sorted.filter(r => !r.is_vulnerable);

    // Render each vulnerable package as a full card
    for (const result of vulnerableResults) {
        resultsListEl.appendChild(buildVulnerableCard(result));
    }

    // Render safe packages collapsed inside a toggle section
    if (safeResults.length > 0) {
        resultsListEl.appendChild(buildSafeSection(safeResults));
    }

    // Show the section and scroll to it smoothly
    resultsSection.hidden = false;
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Builds the HTML card for a single vulnerable package.
 * Each vulnerability within the package gets its own row inside the card body.
 */
function buildVulnerableCard(result) {
    const dep   = result.dependency;
    const worst = getWorstSeverity(result.vulnerabilities);
    const count = result.vulnerabilities.length;

    const card = document.createElement('div');
    card.className = 'result-card result-card--vulnerable';

    // ── Card Header ──
    // Shows: package name, version badge, ecosystem badge, vuln count, worst severity
    const header = document.createElement('div');
    header.className = 'result-header';
    header.innerHTML = `
        <div class="result-pkg">
            <span class="pkg-name">${escapeHtml(dep.name)}</span>
            <span class="pkg-version">${escapeHtml(dep.version)}</span>
            <span class="pkg-ecosystem pkg-ecosystem--${dep.ecosystem.toLowerCase()}">
                ${escapeHtml(dep.ecosystem)}
            </span>
        </div>
        <div class="result-meta">
            <span class="vuln-count">${count} ${count === 1 ? 'vulnerability' : 'vulnerabilities'}</span>
            ${worst
                ? `<span class="severity-badge severity-badge--${worst.toLowerCase()}">${escapeHtml(worst)}</span>`
                : ''}
        </div>
    `;

    // ── Card Body ──
    // One row per vulnerability found for this package
    const body = document.createElement('div');
    body.className = 'result-body';

    for (const vuln of result.vulnerabilities) {
        const sev = (vuln.severity || 'unknown').toLowerCase();

        const vulnEl = document.createElement('div');
        vulnEl.className = 'vuln-item';
        vulnEl.innerHTML = `
            <div class="vuln-header">
                <span class="vuln-id">${escapeHtml(vuln.id)}</span>
                <span class="severity-badge severity-badge--${escapeHtml(sev)}">
                    ${escapeHtml(vuln.severity || 'UNKNOWN')}
                </span>
            </div>
            <p class="vuln-summary">${escapeHtml(vuln.summary)}</p>
            ${vuln.fixed_version
                ? `<div class="vuln-fix">
                       <span class="fix-label">Recommended fix:</span>
                       <span class="fix-version">upgrade to ${escapeHtml(vuln.fixed_version)}</span>
                   </div>`
                : `<div class="vuln-fix vuln-fix--none">
                       No patched version recorded — check the package changelog manually.
                   </div>`
            }
        `;
        body.appendChild(vulnEl);
    }

    card.appendChild(header);
    card.appendChild(body);
    return card;
}

/**
 * Builds a collapsible section listing all safe (non-vulnerable) packages.
 * Collapsed by default so they don't bury the important vulnerable results.
 */
function buildSafeSection(safeResults) {
    const wrapper = document.createElement('div');
    wrapper.className = 'safe-section';

    const toggle = document.createElement('button');
    toggle.className = 'safe-toggle';
    toggle.innerHTML = `
        <span class="safe-toggle-icon">▸</span>
        Show ${safeResults.length} safe package${safeResults.length !== 1 ? 's' : ''}
        — no known vulnerabilities found
    `;

    const list = document.createElement('div');
    list.className = 'safe-list';
    list.hidden = true;

    for (const result of safeResults) {
        const dep = result.dependency;
        const row = document.createElement('div');
        row.className = 'safe-row';
        row.innerHTML = `
            <span class="safe-check">✓</span>
            <span class="pkg-name">${escapeHtml(dep.name)}</span>
            <span class="pkg-version">${escapeHtml(dep.version)}</span>
            <span class="pkg-ecosystem pkg-ecosystem--${dep.ecosystem.toLowerCase()}">
                ${escapeHtml(dep.ecosystem)}
            </span>
        `;
        list.appendChild(row);
    }

    // Toggle the list open/closed on button click
    toggle.addEventListener('click', () => {
        const isHidden = list.hidden;
        list.hidden = !isHidden;
        toggle.querySelector('.safe-toggle-icon').textContent = isHidden ? '▾' : '▸';
    });

    wrapper.appendChild(toggle);
    wrapper.appendChild(list);
    return wrapper;
}

// ── UI State Helpers ──────────────────────────────────────────────────────────

function showLoading()  { loadingEl.hidden = false; }
function hideLoading()  { loadingEl.hidden = true; }
function hideResults()  { resultsSection.hidden = true; }

function showError(msg) {
    errorMsgEl.textContent = msg;
    errorBanner.hidden = false;
}

function hideError() { errorBanner.hidden = true; }

errorCloseBtn.addEventListener('click', hideError);

// ── Security: XSS Prevention ──────────────────────────────────────────────────
/**
 * Escapes HTML special characters in a string before inserting it into innerHTML.
 *
 * WHY THIS MATTERS:
 * Package names and CVE summaries come from the OSV.dev API — an external source
 * we do not control. If a vulnerability summary contained:
 *   <script>document.cookie = 'stolen'</script>
 * ...and we inserted it raw into innerHTML, the browser would execute it.
 * This is a Cross-Site Scripting (XSS) attack.
 *
 * By replacing < > " ' & with their HTML entity equivalents, we tell the browser
 * to render those characters as visible text rather than as HTML or JavaScript.
 */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#39;');
}
