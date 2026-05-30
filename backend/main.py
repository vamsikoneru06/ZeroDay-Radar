from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx

from parsers import parse_requirements_txt, parse_package_json
from osv_client import scan_dependencies as query_osv

# ---------------------------------------------------------------------------
# App initialisation
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Zero-Day Radar API",
    description="Scans dependency files for known vulnerabilities using OSV.dev",
    version="0.2.0",
)

# ---------------------------------------------------------------------------
# CORS middleware
# ---------------------------------------------------------------------------
# Allows the frontend (served on a different port) to call this API.
# In production, replace "*" with your exact frontend URL.

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/")
def health_check():
    """Confirms the server is running. Visit http://127.0.0.1:8000/ to check."""
    return {"status": "Zero-Day Radar API is running", "version": "0.2.0"}


@app.post("/scan")
async def scan_file(file: UploadFile = File(...)):
    """
    Main endpoint. Accepts a file upload, parses it, queries OSV.dev for
    vulnerability data, and returns a structured scan report.

    Steps:
      1. Read and decode the uploaded file.
      2. Detect the file type and route to the correct parser.
      3. Call the OSV.dev batch API with all parsed dependencies.
      4. Return a JSON report with vulnerability details per dependency.
    """

    # --- Step 1: Read the file bytes and decode to text ---
    content_bytes = await file.read()
    try:
        content = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400,
            detail="File could not be decoded as UTF-8. Please upload a plain text file.",
        )

    # --- Step 2: Parse based on filename ---
    filename = file.filename or ""

    if filename.endswith("requirements.txt"):
        deps = parse_requirements_txt(content)
        ecosystem = "PyPI"

    elif filename.endswith("package.json"):
        try:
            deps = parse_package_json(content)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        ecosystem = "npm"

    else:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported file: '{filename}'. "
                "Please upload a file named 'requirements.txt' or 'package.json'."
            ),
        )

    if not deps:
        raise HTTPException(
            status_code=422,
            detail="No dependencies were found in the uploaded file.",
        )

    # --- Step 3: Query OSV.dev ---
    # We wrap the OSV call in a try/except to handle network failures gracefully.
    # If OSV.dev is unreachable or returns an error, the user gets a meaningful
    # message instead of a cryptic 500 Internal Server Error.
    try:
        results = await query_osv(deps)
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="The request to OSV.dev timed out. Please try again in a moment.",
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"OSV.dev returned an error: {e.response.status_code}. Please try again.",
        )
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Could not reach OSV.dev: {str(e)}. Check your internet connection.",
        )

    # --- Step 4: Build and return the response ---
    vulnerable_count = sum(1 for r in results if r.is_vulnerable)

    return {
        "filename": filename,
        "ecosystem": ecosystem,
        "dependency_count": len(deps),
        "vulnerable_count": vulnerable_count,
        "results": [r.model_dump() for r in results],
    }
