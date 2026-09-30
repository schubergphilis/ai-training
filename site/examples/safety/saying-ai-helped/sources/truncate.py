# truncate.py, from the Hazeldine text helpers
# Copyright (c) 2021 M. Hazeldine
# MIT License. This line stands in for the full permission notice in LICENSE.


def truncate_words(text, limit, marker="..."):
    """Cut text after `limit` words and add the marker if anything was cut."""
    words = text.split()
    if len(words) <= limit:
        return text
    # Keep whole words only; never cut one in half
    kept = " ".join(words[:limit])
    # Drop trailing punctuation so the marker does not follow a comma
    kept = kept.rstrip(",;:")
    return kept + marker
