# Throwaway: answers which done marks old-list.txt uses. Delete after.
from collections import Counter
from pathlib import Path

lines = Path("old-list.txt").read_text(encoding="utf-8").splitlines()
blank = sum(1 for line in lines if not line.strip())
words = Counter(line.split()[0] for line in lines if line.strip())
print(f"{len(lines)} lines, {blank} blank")
for word, count in words.most_common(5):
    print(f"{word}: {count}")
