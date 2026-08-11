"""SSRF guard: refuse private/loopback/non-http URLs in the discussion fetcher."""
import pytest

from app.services.discussions import _is_safe_url


@pytest.mark.parametrize("url,ok", [
    ("https://www.reddit.com/r/x/1", True),
    ("http://example.com/page", True),
    ("https://www.quora.com/What-is", True),
    ("ftp://example.com/x", False),            # bad scheme
    ("file:///etc/passwd", False),             # bad scheme
    ("https://169.254.169.254/latest/meta-data/", False),  # cloud metadata
    ("http://localhost:8421/admin", False),    # loopback
    ("http://127.0.0.1/x", False),             # loopback
    ("http://10.0.0.5/x", False),              # private
    ("http://192.168.1.1/x", False),           # private
    ("http://[::1]/x", False),                 # ipv6 loopback
])
def test_is_safe_url(url, ok):
    assert _is_safe_url(url) is ok


def test_fetch_page_text_refuses_unsafe_url():
    """_fetch_page_text must short-circuit unsafe URLs (no network call)."""
    import asyncio
    from app.services import discussions as D

    # A private/loopback host must be refused without raising / without fetching.
    out = asyncio.run(D._fetch_page_text("http://169.254.169.254/latest/meta-data/"))
    assert out == ""
