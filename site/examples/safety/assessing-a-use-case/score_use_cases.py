"""Score three proposed AI use cases against a risk threshold.

The fixture behind the lesson "Assessing the risk of a use case before it
starts". Each use case names the domains it touches and the people it
affects, and carries an impact rating and a likelihood rating on four-point
scales. The level is impact times likelihood, and a level at or above the
threshold needs extra controls or a written acceptance.

Nothing here talks to a model or to the network. The ratings are the
lesson's own worked example, and the output is what the page shows.
"""

IMPACT = {1: "minor", 2: "moderate", 3: "major", 4: "severe"}
LIKELIHOOD = {1: "rare", 2: "possible", 3: "likely", 4: "almost certain"}
THRESHOLD = 8


def band(level):
    """Name the band a level falls in."""
    if level >= 12:
        return "very high"
    if level >= THRESHOLD:
        return "high"
    if level >= 4:
        return "medium"
    return "low"


# name, domains, affected, impact, likelihood
USE_CASES = [
    (
        "meeting summarizer",
        "personal data, reputation",
        "everyone in the meetings, and anyone discussed in a one-to-one",
        3,
        3,
    ),
    (
        "newsletter drafter",
        "reputation",
        "the staff who read the newsletter",
        2,
        2,
    ),
    (
        "customer mail agent",
        "personal data, money, reputation",
        "every customer who writes in, and the support team",
        4,
        3,
    ),
]


def report(name, domains, affected, impact, likelihood):
    """Print one scored use case."""
    level = impact * likelihood
    print("use case: " + name)
    print("  domains: " + domains)
    print("  affected: " + affected)
    print(f"  impact: {impact} ({IMPACT[impact]})")
    print(f"  likelihood: {likelihood} ({LIKELIHOOD[likelihood]})")
    print(f"  level: {level} ({band(level)})")
    print("  at or above threshold: " + ("yes" if level >= THRESHOLD else "no"))


def main():
    print(f"threshold: {THRESHOLD} ({band(THRESHOLD)})")
    for name, domains, affected, impact, likelihood in USE_CASES:
        print()
        report(name, domains, affected, impact, likelihood)


if __name__ == "__main__":
    main()
