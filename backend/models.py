from pydantic import BaseModel
from typing import List, Optional


class Dependency(BaseModel):
    name: str
    version: str
    ecosystem: str  # "PyPI" for requirements.txt, "npm" for package.json


class Vulnerability(BaseModel):
    id: str                          # e.g. "CVE-2021-23337" or "GHSA-xxxx-xxxx-xxxx"
    summary: str
    severity: Optional[str] = None   # "CRITICAL", "HIGH", "MEDIUM", "LOW", or None
    fixed_version: Optional[str] = None


class ScanResult(BaseModel):
    dependency: Dependency
    vulnerabilities: List[Vulnerability]
    is_vulnerable: bool
