def shorten(text, limit, marker="..."):
    """Return at most limit words, with a marker when words were dropped."""
    words = text.split()
    if len(words) <= limit:
        return text
    return " ".join(words[:limit]).rstrip(",;:") + marker
