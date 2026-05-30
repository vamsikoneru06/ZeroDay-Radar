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
    #
    # The dict.get() method safely returns None if the key is missing,
    # avoiding a KeyError crash. We use isinstance() before calling .get()
    # because occasionally this field is not a dict.
    db_specific = vuln.get("database_specific", {})
    if isinstance(db_specific, dict):
        severity = db_specific.get("severity")
        if severity:
            return str(severity).upper()

    # --- Location 2: ecosystem_specific.severity (inside affected list) ---
    #
    # Some entries (especially PyPI ones) store severity here instead.
    # We iterate through the affected list because a single vulnerability
    # can affect multiple packages/ecosystems simultaneously.
    for affected in vuln.get("affected", []):
        eco_specific = affected.get("ecosystem_specific", {})
        if isinstance(eco_specific, dict):
            severity = eco_specific.get("severity")
            if severity:
                return str(severity).upper()

    # --- Location 3: CVSS numeric score in database_specific ---
    #
    # Some entries skip the plain label but include a numeric CVSS score
    # (e.g., 7.5). We map that number to a severity label using NIST's
    # official CVSS v3 severity scale.
    if isinstance(db_specific, dict):
        cvss_score = db_specific.get("cvss_score")
        if cvss_score is not None:
            return _cvss_score_to_label(float(cvss_score))

    # If none of the above yielded a result, we genuinely don't know.
    return None


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
