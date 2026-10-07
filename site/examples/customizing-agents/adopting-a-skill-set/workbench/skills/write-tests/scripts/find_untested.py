"""Print the functions in a source directory that no test file names.

Part of the invented workbench skill set, for the lesson "Adopting a
published skill set". It only reads files.
"""

import re
import sys
from pathlib import Path

DEF = re.compile(r"^def (\w+)\(", re.MULTILINE)


def main(source: Path) -> None:
    tests = " ".join(p.read_text(encoding="utf-8") for p in source.rglob("test_*.py"))
    for path in sorted(source.rglob("*.py")):
        if path.name.startswith("test_"):
            continue
        for name in DEF.findall(path.read_text(encoding="utf-8")):
            if name not in tests:
                print(f"{path}: {name}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
