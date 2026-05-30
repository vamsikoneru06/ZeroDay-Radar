import re
import json
from typing import List

from models import Dependency


def parse_requirements_txt(content: str) -> List[Dependency]:
    """
    Parses the text content of a requirements.txt file.
    Returns a list of Dependency objects with ecosystem set to "PyPI".

    Handles these common formats:
        requests==2.25.0          (exact pin — best for vulnerability matching)
        flask>=1.0.2              (lower bound only)
        django>=2.2.0,<3.0        (version range)
        pillow~=8.1.0             (compatible release)
        pyyaml                    (no version specified)
    """
    dependencies = []

    for raw_line in content.splitlines():

        # Step 1: Remove leading and trailing whitespace from the line.
        line = raw_line.strip()

        # Step 2: Skip completely blank lines — they carry no information.
        if not line:
            continue

        # Step 3: Skip comment lines. In requirements.txt, any line starting
        #         with '#' is a comment and should be ignored.
        if line.startswith('#'):
            continue

        # Step 4: Skip pip special directives. Lines starting with '-' are
        #         things like "-r other-file.txt" (include another file) or
        #         "--index-url https://..." (configuration). Not packages.
        if line.startswith('-'):
            continue

        # Step 5: Skip VCS (version control) and URL installs.
        #         e.g. "git+https://github.com/user/repo.git"
        #         These don't have a traditional version number to query against.
        if re.match(r'^(git\+|https?://|svn\+|hg\+)', line):
            continue

        # Step 6: Remove inline comments. A line like:
        #         "requests==2.25.0  # used for HTTP calls"
        #         becomes "requests==2.25.0" after splitting on '#'.
        line = line.split('#')[0].strip()

        # Step 7: Remove environment markers. A line like:
        #         "pywin32>=1.0; sys_platform=='win32'"
        #         The semicolon separates the package from the platform condition.
        #         We only want the package part.
        line = line.split(';')[0].strip()

        # Guard: after all that stripping, the line might now be empty.
        if not line:
            continue

        # Step 8: Extract the package name.
        #
        #         Package names in PyPI follow a specific format:
        #         - Must start and end with a letter or digit
        #         - Can contain letters, digits, dots, hyphens, underscores in the middle
        #
        #         The regex r'^([A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?)' matches:
        #           ^               — start of string
        #           [A-Za-z0-9]    — first character must be alphanumeric
        #           (              — start of optional middle section
        #             [A-Za-z0-9._-]*  — zero or more alphanumeric/dot/dash/underscore chars
        #             [A-Za-z0-9]      — last character must be alphanumeric
        #           )?             — the middle section is optional (handles single-char names)
        #
        #         This correctly captures "requests" from "requests==2.25.0"
        #         and "my-package" from "my-package>=1.0"
        name_match = re.match(r'^([A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?)', line)
        if not name_match:
            continue  # Line doesn't look like a package name at all — skip it

        name = name_match.group(1)

        # Step 9: Extract the version number.
        #
        #         The regex r'[=~<>!]+\s*([0-9][A-Za-z0-9._-]*)' matches:
        #           [=~<>!]+           — one or more operator characters (==, >=, ~=, !=, etc.)
        #           \s*                — optional whitespace between operator and version
        #           (                  — start capturing the version number
        #             [0-9]            — version must start with a digit
        #             [A-Za-z0-9._-]*  — followed by any valid version characters
        #           )                  — end capture
        #
        #         From "requests==2.25.0"   → captures "2.25.0"
        #         From "flask>=1.0.2"       → captures "1.0.2" (the first/minimum version)
        #         From "django>=2.2.0,<3.0" → captures "2.2.0" (the lower bound)
        #
        #         If no version operator is found, we store "unspecified" — the OSV
        #         API can still be queried but results will be less precise.
        version_match = re.search(r'[=~<>!]+\s*([0-9][A-Za-z0-9._-]*)', line)
        version = version_match.group(1) if version_match else "unspecified"

        dependencies.append(Dependency(name=name, version=version, ecosystem="PyPI"))

    return dependencies


def parse_package_json(content: str) -> List[Dependency]:
    """
    Parses the text content of a package.json file.
    Returns a list of Dependency objects with ecosystem set to "npm".

    Reads from both "dependencies" and "devDependencies" sections —
    devDependencies can be bundled in production builds and are equally
    important to check.

    Handles semver range prefixes:
        "^4.17.11"  →  "4.17.11"   (caret: compatible with 4.x.x)
        "~1.2.3"    →  "1.2.3"     (tilde: compatible with 1.2.x)
        ">=1.0.0"   →  "1.0.0"
        "1.0.0"     →  "1.0.0"     (already clean)
        "latest"    →  "unspecified"
    """
    dependencies = []

    # Step 1: Parse the raw string as JSON.
    #         json.loads() converts a JSON string into a Python dictionary.
    #         If the file has a syntax error, it raises json.JSONDecodeError.
    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON in package.json: {e}")

    # Step 2: Collect dependencies from both sections into a single dictionary.
    #         data.get("dependencies", {}) safely returns an empty dict if the
    #         key doesn't exist, preventing a KeyError crash.
    all_deps: dict = {}
    all_deps.update(data.get("dependencies", {}))
    all_deps.update(data.get("devDependencies", {}))

    # Step 3: Iterate over every package name and its version string.
    for name, version_raw in all_deps.items():

        # Step 4: Strip semver range prefix characters.
        #
        #         npm version strings often include range operators at the start:
        #           "^4.17.11"  means "4.17.11 or any compatible minor version"
        #           "~1.2.3"    means "1.2.3 or any compatible patch version"
        #           ">=1.0.0"   means "1.0.0 or higher"
        #
        #         We only want the base version number for querying OSV.dev.
        #         re.sub(r'^[\^~>=<\s]+', '', ...) means:
        #           ^          — match at the start of the string
        #           [\^~>=<\s] — match any of these characters: ^ ~ > = < or whitespace
        #           +          — one or more of the above
        #         Replace that entire leading section with '' (empty string).
        #
        #         str(version_raw) handles the rare case where the value isn't a string.
        version = re.sub(r'^[\^~>=<\s]+', '', str(version_raw)).strip()

        # Step 5: If the result doesn't start with a digit, it's not a usable
        #         version number. Tags like "latest", "next", or file references
        #         like "file:../local-package" fall into this category.
        if not re.match(r'^\d', version):
            version = "unspecified"

        dependencies.append(Dependency(name=name, version=version, ecosystem="npm"))

    return dependencies
