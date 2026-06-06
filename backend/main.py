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
# Only the local Vite dev server and the built preview are allowed.
# Add your deployed frontend URL here when you go to production.

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",   # vite preview
    "http://127.0.0.1:4173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],   # only what the app actually uses
    allow_headers=["Content-Type"],
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
    MAX_BYTES = 512 * 1024  # 512 KB — far more than any real manifest needs
    content_bytes = await file.read()
    if len(content_bytes) > MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail="File too large. Maximum allowed size is 512 KB.",
        )

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

    MAX_DEPS = 300  # prevents runaway OSV batch queries
    if len(deps) > MAX_DEPS:
        raise HTTPException(
            status_code=422,
            detail=f"Too many dependencies ({len(deps)} found). Maximum supported is {MAX_DEPS}.",
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
