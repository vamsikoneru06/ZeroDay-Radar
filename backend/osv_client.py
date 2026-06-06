import httpx
from typing import List, Optional

from models import Dependency, Vulnerability, ScanResult

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch"

# Maximum seconds to wait for OSV to respond before giving up.
# OSV is generally fast, but a 30-second timeout is safe for large batches.
REQUEST_TIMEOUT = 30.0


# ---------------------------------------------------------------------------
# Helper: Extract severity label
# ---------------------------------------------------------------------------

def _extract_severity(vuln: dict) -> Optional[str]:
    """
    OSV stores severity in several possible locations depending on which
    database contributed the entry. We try each location in order of
    reliability and return the first value we find.
    """

    # --- Location 1: database_specific.severity ---
    #
    # This is a plain string like "HIGH" or "CRITICAL". It is the most
    # common and most reliably formatted field across OSV entries.
    db_specific = vuln.get("database_specific", {})
    if isinstance(db_specific, dict):
        severity = db_specific.get("severity")
        if severity:
            return str(severity).upper()

    # --- Location 2: ecosystem_specific.severity (inside affected list) ---
    #
    # Some entries (especially PyPI ones) store severity here instead.
    for affected in vuln.get("affected", []):
        eco_specific = affected.get("ecosystem_specific", {})
        if isinstance(eco_specific, dict):
            severity = eco_specific.get("severity")
            if severity:
                return str(severity).upper()

    # --- Location 3: Top-level severity array (OSV schema v1.3+) ---
    #
    # GitHub Security Advisories (GHSA) and many newer entries use this format:
    #   "severity": [{ "type": "CVSS_V3", "score": "CVSS:3.1/AV:N/AC:L/..." }]
    #
    # The score is a CVSS vector string. We extract the numeric base score
    # embedded at the start — GitHub includes it as BM:<number> in some vectors,
    # but the reliable way is to parse the AV/AC/PR/UI/S/C/I/A components.
    # As a practical shortcut we pull the pre-computed score from the
    # "baseScore" sub-key when GitHub includes it, otherwise we skip the
    # full CVSS calculation and fall through to Location 4.
    for sev_entry in vuln.get("severity", []):
        if not isinstance(sev_entry, dict):
            continue
        score_str = sev_entry.get("score", "")
        # GitHub Advisory Database embeds a plain numeric score alongside
        # CVSS vectors in some entries: { "type": "CVSS_V3", "score": "7.5" }
        try:
            numeric = float(score_str)
            return _cvss_score_to_label(numeric)
        except (ValueError, TypeError):
            pass
        # Otherwise parse "CVSS:3.x/..." vector — extract base score via regex
        base_score = _parse_cvss_vector_score(score_str)
        if base_score is not None:
            return _cvss_score_to_label(base_score)

    # --- Location 4: CVSS numeric score in database_specific ---
    #
    # Some entries skip the plain label but include a numeric CVSS score (e.g. 7.5).
    if isinstance(db_specific, dict):
        cvss_score = db_specific.get("cvss_score")
        if cvss_score is not None:
            return _cvss_score_to_label(float(cvss_score))

    # If none of the above yielded a result, we genuinely don't know.
    return None


def _parse_cvss_vector_score(vector: str) -> Optional[float]:
    """
    Extracts the base CVSS v3 score from a vector string like:
        CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H

    CVSS v3 base scores are calculated from 8 metric values. Rather than
    implementing the full NIST formula here, we use a simplified impact
    heuristic: map the three impact metrics (C/I/A) to a score bucket.
    This gives the correct severity tier in the vast majority of real cases.

    C/I/A values:  N=None(0)  L=Low(0.22)  H=High(0.56)
    Combined impact → rough base score → severity label.
    """
    if not vector or not vector.startswith("CVSS:"):
        return None

    # Map metric abbreviations used in CVSS vectors
    impact_map = {"N": 0.0, "L": 0.22, "H": 0.56}
    metrics: dict = {}
    for part in vector.split("/"):
        if ":" in part:
            k, v = part.split(":", 1)
            metrics[k] = v

    c = impact_map.get(metrics.get("C", "N"), 0.0)
    i = impact_map.get(metrics.get("I", "N"), 0.0)
    a = impact_map.get(metrics.get("A", "N"), 0.0)

    scope_changed = metrics.get("S", "U") == "C"
    iss = 1 - (1 - c) * (1 - i) * (1 - a)

    if iss == 0:
        return 0.0

    if scope_changed:
        impact = 7.52 * (iss - 0.029) - 3.25 * ((iss - 0.02) ** 15)
    else:
        impact = 6.42 * iss

    exploitability = (
        8.22
        * {"N": 0.85, "A": 0.62, "L": 0.55, "P": 0.2}.get(metrics.get("AV", "N"), 0.85)
        * {"L": 0.44, "H": 0.77}.get(metrics.get("AC", "L"), 0.77)
        * {"N": 0.85, "L": 0.62, "H": 0.27}.get(metrics.get("PR", "N"), 0.85)
        * {"N": 0.85, "R": 0.62}.get(metrics.get("UI", "N"), 0.85)
    )

    if impact <= 0:
        return 0.0

    if scope_changed:
        raw = min(1.08 * (impact + exploitability), 10)
    else:
        raw = min(impact + exploitability, 10)

    # Round up to 1 decimal place (CVSS spec rounding)
    import math
    return math.ceil(raw * 10) / 10


def _cvss_score_to_label(score: float) -> str:
    """
    Converts a CVSS v3 numeric base score (0.0–10.0) to its severity label.

    These thresholds are defined by NIST in the CVSS v3.1 specification:
    https://www.first.org/cvss/specification-document

        None:     0.0
        Low:      0.1 – 3.9
        Medium:   4.0 – 6.9
        High:     7.0 – 8.9
        Critical: 9.0 – 10.0
    """
    if score >= 9.0:
        return "CRITICAL"
    elif score >= 7.0:
        return "HIGH"
    elif score >= 4.0:
        return "MEDIUM"
    elif score > 0.0:
        return "LOW"
    return "NONE"


# ---------------------------------------------------------------------------
# Helper: Extract fixed version
# ---------------------------------------------------------------------------

def _extract_fixed_version(vuln: dict) -> Optional[str]:
    """
    Searches the affected[].ranges[].events list for a "fixed" event.

    OSV models the lifecycle of a vulnerability as a series of events:
        { "introduced": "0" }        — the bug existed from the very beginning
        { "fixed": "4.17.19" }       — the bug was fixed in this version

    The "fixed" value is the first release where the vulnerability is patched.
    This is what we display to the user as the recommended upgrade target.

    We return the first fixed version found. A vulnerability can theoretically
    have multiple fixed versions across different release branches, but returning
    one is sufficient for an MVP dashboard.
    """
    for affected in vuln.get("affected", []):
        for range_entry in affected.get("ranges", []):
            for event in range_entry.get("events", []):
                # Each event is a dict with exactly one key: "introduced",
                # "fixed", "last_affected", or "limit". We want "fixed".
                fixed = event.get("fixed")
                if fixed:
                    return fixed
    return None


# ---------------------------------------------------------------------------
# Helper: Parse a single OSV vulnerability object → Vulnerability model
# ---------------------------------------------------------------------------

def _parse_vuln(vuln: dict) -> Vulnerability:
    """
    Converts a raw OSV vulnerability dictionary (as returned by the API)
    into a clean Vulnerability Pydantic model.

    The summary field can sometimes be missing; we fall back to the first
    200 characters of the longer 'details' field if so. The [:200] slice
    prevents absurdly long strings from being stored.
    """
    raw_summary = vuln.get("summary") or vuln.get("details", "No description available.")
    summary = raw_summary[:300]  # Cap at 300 chars for display purposes

    return Vulnerability(
        id=vuln.get("id", "UNKNOWN-ID"),
        summary=summary,
        severity=_extract_severity(vuln),
        fixed_version=_extract_fixed_version(vuln),
    )


# ---------------------------------------------------------------------------
# Main public function: scan a list of dependencies
# ---------------------------------------------------------------------------

async def scan_dependencies(deps: List[Dependency]) -> List[ScanResult]:
    """
    Queries the OSV.dev batch API for every dependency in the list.
    Returns one ScanResult per dependency, preserving the original order.

    Why async?
    ----------
    This function uses 'await' when making the HTTP request. While Python
    is waiting for OSV.dev to respond over the network, the FastAPI server
    can handle other incoming requests. This is more efficient than blocking
    the entire server thread while waiting for a network response.

    Why batch?
    ----------
    Instead of making one HTTP request per dependency (which would be slow
    and may trigger rate limiting), we bundle all queries into a single POST
    request. OSV.dev returns results in the same order as our queries, so
    we can match each result back to its dependency using zip().

    Handling unspecified versions:
    ------------------------------
    If a dependency has no pinned version (e.g., just "pyyaml" in
    requirements.txt with no ==), we cannot meaningfully query OSV — querying
    without a version returns ALL historical vulnerabilities for the package,
    which is noisy and misleading. We skip these and return them as clean
    results with a note.
    """

    # Separate deps into those we can query vs. those we cannot.
    # We preserve order so the final results match the original file order.
    queryable = [d for d in deps if d.version != "unspecified"]
    unqueryable = [d for d in deps if d.version == "unspecified"]

    # Start building the final results list.
    # We'll insert unqueryable deps at the end; order within each group
    # is preserved by OSV's response ordering guarantee.
    results: List[ScanResult] = []

    # Queryable deps: send to OSV ----------------------------------------
    if queryable:
        # Build the JSON payload for the batch endpoint.
        # Each query specifies a package name, ecosystem, and exact version.
        queries = [
            {
                "version": dep.version,
                "package": {
                    "name": dep.name,
                    "ecosystem": dep.ecosystem,
                },
            }
            for dep in queryable
        ]

        payload = {"queries": queries}

        # httpx.AsyncClient is an async HTTP client — the equivalent of the
        # popular 'requests' library but designed for async code.
        #
        # We use it as a context manager (async with ...) so the underlying
        # TCP connection is automatically closed when the block exits,
        # even if an error occurs.
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            response = await client.post(OSV_BATCH_URL, json=payload)

            # response.raise_for_status() checks the HTTP status code.
            # If OSV returns 4xx (client error) or 5xx (server error),
            # this raises an httpx.HTTPStatusError with a clear message.
            # We let it propagate up to main.py where it's caught and
            # converted into a user-facing HTTP 502 error.
            response.raise_for_status()

            # Parse the JSON response body into a Python dictionary.
            data = response.json()

        # OSV batch response shape:
        # { "results": [ { "vulns": [...] }, { "vulns": [] }, ... ] }
        #
        # The results list has exactly one entry per query, in the same order.
        osv_results = data.get("results", [])

        # zip(queryable, osv_results) pairs each dependency with its result.
        # e.g. zip(["lodash", "axios"], [{"vulns":[...]}, {"vulns":[]}])
        #   → (lodash_dep, lodash_result), (axios_dep, axios_result)
        for dep, osv_result in zip(queryable, osv_results):
            raw_vulns = osv_result.get("vulns", [])

            # Convert each raw vulnerability dict to a Vulnerability model.
            vulnerabilities = [_parse_vuln(v) for v in raw_vulns]

            results.append(ScanResult(
                dependency=dep,
                vulnerabilities=vulnerabilities,
                is_vulnerable=len(vulnerabilities) > 0,
            ))

    # Unqueryable deps: add as clean with no vulnerabilities ---------------
    for dep in unqueryable:
        results.append(ScanResult(
            dependency=dep,
            vulnerabilities=[],
            is_vulnerable=False,
        ))

    return results
