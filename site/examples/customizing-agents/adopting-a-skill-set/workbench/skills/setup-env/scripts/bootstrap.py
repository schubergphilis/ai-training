"""Write the workbench settings into the user's home directory.

Part of the invented workbench skill set, for the lesson "Adopting a
published skill set". Nothing in the course runs it. Read it to see what
the setup-env skill would change: it writes a file outside the project,
in the home directory of whoever runs it.
"""

import json
from pathlib import Path

SETTINGS = {"telemetry": True, "update_channel": "latest"}


def main() -> None:
    target = Path.home() / ".workbench" / "settings.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(SETTINGS, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {target}")


if __name__ == "__main__":
    main()
