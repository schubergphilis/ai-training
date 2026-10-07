"""check_money: a review finding turned into a check.

Two reviews of the nightly import found the same thing: an amount of money
converted with `float()`. A binary float can't hold most decimal amounts
exactly, so the team's rule is that money goes through `decimal.Decimal`.
This script makes that rule a check that a CI step can run:

    python3 check_money.py importer.py

It prints one line for each line of code that calls `float(`, ignoring
comments, and exits with status 1 when it finds one. With no findings it
prints `no findings` and exits with status 0. The check is crude on
purpose: it flags every `float(` call, so a file that needs a float for
something other than money is the moment to make the check narrower.
"""

import re
import sys

CALL = re.compile(r"\bfloat\(")


def findings(path):
    """Return (line number, line) for each code line that calls float()."""
    found = []
    with open(path, encoding="utf-8") as handle:
        for number, line in enumerate(handle, start=1):
            code = line.split("#", 1)[0]
            if CALL.search(code):
                found.append((number, line.strip()))
    return found


def main(argv):
    paths = argv[1:]
    if not paths:
        print("usage: python3 check_money.py <file.py> ...")
        return 2
    count = 0
    for path in paths:
        for number, line in findings(path):
            print(f"{path}:{number}: money as float, use decimal.Decimal: {line}")
            count += 1
    if count == 0:
        print("no findings")
        return 0
    print(f"{count} finding(s)")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
