"""Put the real values back into a reply that was drafted on redacted text.

The reply in `sample/reply.txt` was written for the redacted email, so it
says "Person 1" and "Person 2". The map that made the redaction turns the
placeholders back into the names. The map never went into the tool, so the tool never
saw the names, and the reply that goes to the customer is still addressed
to a person.

    python3 restore.py
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import redaction  # noqa: E402  (imported after sys.path knows this directory)

REPLY = redaction.read_sample("reply.txt")

if __name__ == "__main__":
    print(redaction.restore(REPLY, redaction.MAP), end="")
