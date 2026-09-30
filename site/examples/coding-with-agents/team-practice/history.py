"""Builds the invoice project's history and prints it, oldest commit first.

Usage:
    python3 history.py            # build it in a temporary place and print it
    python3 history.py ~/invoices # build it there and keep it, to read with git

The history has three incidents among the ordinary commits. Each one is a
commit the team had to take back or repair, and its message says what went
wrong. The project's `AGENTS.md` is `agents-draft.md` from this directory,
the practice section the team wrote before any of the incidents.

git runs with only the variables below and no user or system config, so
nothing in your own setup (a template directory, a hook, a signing key)
changes the history. Each commit has a fixed date.
"""

import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
DRAFT = os.path.join(HERE, "agents-draft.md")

AUTHOR = ("Robin", "robin@example.com")
ASSISTED = "Assisted-by: Claude:claude-sonnet-4-6"

INVOICES_START = '''"""The invoice rules."""


def total(amount: float) -> float:
    return round(amount, 2)
'''

LOCK_START = "python-dateutil==2.9.0\nreportlab==4.2.0\n"
LOCK_UPGRADED = "python-dateutil==2.9.0.post0\nreportlab==4.4.0\n"

CSV_EXPORT = """

def as_csv_row(number: str, amount: float) -> str:
    return f"{number},{total(amount):.2f}"
"""

DUE_DATE = """

def due_in_days() -> int:
    return 30
"""

DISCOUNT_NO_CAP = """

def early_discount(amount: float, days_early: int) -> float:
    return round(amount * 0.01 * days_early, 2)
"""

DISCOUNT_CAPPED = """

def early_discount(amount: float, days_early: int) -> float:
    return round(amount * 0.01 * min(days_early, 5), 2)
"""

LATE_FEE = """

def late_fee(amount: float, days_late: int) -> float:
    return round(amount * 0.002 * days_late, 2) if days_late > 0 else 0.0
"""

README = "# invoices\n\nThe invoice rules of the shop.\n"
README_RULES = README + (
    "\nEach function in `invoices.py` is one rule: the total, the CSV row,\n"
    "the due date, the early-payment discount and the late fee.\n"
)


def git_env(home: str, date: str) -> "dict[str, str]":
    """An allow-list: only these variables reach git."""
    name, email = AUTHOR
    stamp = f"{date}T10:00:00+00:00"
    return {
        "PATH": os.environ.get("PATH", ""),
        "HOME": home,
        "LANG": "C",
        "LC_ALL": "C",
        "GIT_AUTHOR_NAME": name,
        "GIT_AUTHOR_EMAIL": email,
        "GIT_AUTHOR_DATE": stamp,
        "GIT_COMMITTER_NAME": name,
        "GIT_COMMITTER_EMAIL": email,
        "GIT_COMMITTER_DATE": stamp,
        "GIT_CONFIG_GLOBAL": os.devnull,
        "GIT_CONFIG_SYSTEM": os.devnull,
        "GIT_CONFIG_NOSYSTEM": "1",
    }


class Repo:
    def __init__(self, path: str, home: str) -> None:
        self.path = path
        self.home = home
        self.date = "2026-05-04"

    def git(self, *args: str) -> str:
        result = subprocess.run(
            # maintenance.auto=false: a commit starts no detached `git maintenance`
            # run, which could still hold a lock when the temporary directory is removed.
            [
                "git",
                "-c",
                "commit.gpgsign=false",
                "-c",
                "maintenance.auto=false",
                "-c",
                "core.hooksPath=/dev/null",
                *args,
            ],
            cwd=self.path,
            env=git_env(self.home, self.date),
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise SystemExit(f"git {' '.join(args)} failed:\n{result.stdout}{result.stderr}")
        return result.stdout

    def write(self, name: str, text: str) -> None:
        with open(os.path.join(self.path, name), "w", encoding="utf-8") as handle:
            handle.write(text)

    def commit(self, date: str, message: str) -> None:
        self.date = date
        self.git("add", "-A")
        self.git("commit", "-q", "-m", message)


def build(path: str, home: str) -> Repo:
    os.makedirs(path)
    repo = Repo(path, home)
    repo.git("init", "-q", "--initial-branch=main")
    shutil.copyfile(DRAFT, os.path.join(path, "AGENTS.md"))
    repo.write("README.md", README)
    repo.write("invoices.py", INVOICES_START)
    repo.write("requirements.lock", LOCK_START)
    repo.commit("2026-05-04", "chore: the invoice service")

    code = INVOICES_START + CSV_EXPORT
    repo.write("invoices.py", code)
    repo.write("requirements.lock", LOCK_UPGRADED)
    repo.commit("2026-05-11", f"feat: export invoices as CSV\n\n{ASSISTED}")

    repo.write("invoices.py", INVOICES_START)
    repo.write("requirements.lock", LOCK_START)
    repo.commit(
        "2026-05-12",
        'Revert "feat: export invoices as CSV"\n\n'
        "The agent ran the lock command while it added the export,\n"
        "and requirements.lock upgraded both dependencies. The review\n"
        "read invoices.py and skipped the lockfile, and the release\n"
        "failed its smoke test.",
    )

    repo.write("invoices.py", code)
    repo.commit("2026-05-13", f"feat: export invoices as CSV, lockfile unchanged\n\n{ASSISTED}")

    code += DUE_DATE
    repo.write("invoices.py", code)
    repo.commit("2026-05-18", "feat: a due date on each invoice")

    repo.write("invoices.py", code + DISCOUNT_NO_CAP)
    repo.commit("2026-05-27", f"feat: discount for early payment\n\n{ASSISTED}")

    code += DISCOUNT_CAPPED
    repo.write("invoices.py", code)
    repo.commit(
        "2026-06-02",
        "fix: cap the early-payment discount at five days again\n\n"
        "Two agent sessions ran in two worktrees of one clone. The\n"
        "invoice session stashed its cap on the discount, and the\n"
        "report session popped that stash into its own worktree and\n"
        "discarded it with its other changes. The discount shipped\n"
        "without the cap.",
    )

    repo.write("README.md", README_RULES)
    repo.commit("2026-06-08", "docs: list the invoice rules")

    repo.write("invoices.py", code + LATE_FEE)
    repo.commit(
        "2026-06-16",
        f"feat: late fee on overdue invoices\n\n{ASSISTED}\n"
        "Signed-off-by: Coding Agent <agent@example.com>",
    )

    repo.write("invoices.py", code)
    repo.commit(
        "2026-06-17",
        'Revert "feat: late fee on overdue invoices"\n\n'
        "The commit ends with a sign-off in the agent's name. Our\n"
        "sign-off certifies the Developer Certificate of Origin, and\n"
        "only a person can give that.",
    )

    repo.write("invoices.py", code + LATE_FEE)
    repo.commit(
        "2026-06-18",
        f"feat: late fee on overdue invoices\n\n{ASSISTED}\n"
        "Signed-off-by: Robin <robin@example.com>",
    )
    return repo


def show(repo: Repo) -> None:
    for sha in repo.git("rev-list", "--reverse", "HEAD").split():
        date, subject, body = repo.git(
            "show", "-s", "--date=short", "--format=%ad%x00%s%x00%b", sha
        ).split("\0")
        print(f"{date}  {subject}")
        for line in body.strip().splitlines():
            print(f"            {line}")


def main(argv: "list[str]") -> int:
    if len(argv) > 1:
        target = os.path.abspath(os.path.expanduser(argv[1]))
        if os.path.exists(target):
            print(f"{target} exists already. Pick a folder that doesn't exist yet.")
            return 1
        with tempfile.TemporaryDirectory() as home:
            show(build(target, home))
        print(f"The repository is in {target}.")
        return 0
    with tempfile.TemporaryDirectory() as tmpdir:
        show(build(os.path.join(tmpdir, "invoices"), tmpdir))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
