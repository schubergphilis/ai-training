"""check_money: a review finding turned into a check.

Two reviews of the nightly import found the same thing: an amount of money
converted with `float()`. A binary float can't hold most decimal amounts
exactly, so the team's rule is that money goes through `decimal.Decimal`.
This script makes that rule a check that a CI step can run:

    python3 check_money.py importer.py

It prints one line for each call to `float(` in the code, skipping
comments, strings and this file itself, and exits with status 1 when it
finds one. With no findings it prints `no findings` and exits with status 0. The check is crude on
purpose: it flags every `float(` call, so a file that needs a float for
something other than money is the moment to make the check narrower.
"""

import os
import sys
import tokenize


def findings(path):
    """Return (line number, line) for each line of code that calls float().

    The tokenize module reads the file as Python reads it, so a `float(` in
    a comment or inside a string is not a call and is not reported.
    """
    found = []
    with open(path, "rb") as handle:
        tokens = list(tokenize.tokenize(handle.readline))
    for token, after in zip(tokens, tokens[1:]):
        if token.type == tokenize.NAME and token.string == "float" and after.string == "(":
            found.append((token.start[0], token.line.strip()))
    return found


def main(argv):
    paths = argv[1:]
    if not paths:
        print("usage: python3 check_money.py <file.py> ...")
        return 2
    count = 0
    for path in paths:
        if os.path.abspath(path) == os.path.abspath(__file__):
            continue
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
