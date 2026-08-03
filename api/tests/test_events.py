"""Task 3c: event ring buffer behaviour."""
from app.services import events


def test_emit_then_read_back():
    events.clear()
    events.emit("info", "test", "hello world", cost_usd=0.0)
    got = events.recent(10)
    assert got, "expected at least one event"
    assert got[-1]["message"] == "hello world"
    assert got[-1]["scope"] == "test"
    assert got[-1]["level"] == "info"


def test_ring_caps_at_500():
    events.clear()
    for i in range(560):
        events.emit("info", "test", f"msg-{i}")
    got = events.recent(events.RING_MAX)
    assert len(got) <= events.RING_MAX
    assert got[-1]["message"] == "msg-559"
