"""
The in-app housekeeping loop (app/core/periodic.py) runs each job on its own
interval and keeps going when one fails. Run with: pytest tests/test_periodic.py
"""
from app.core import periodic


async def test_jobs_run_on_their_own_intervals(monkeypatch):
    calls: list[str] = []

    def job(name):
        async def run():
            calls.append(name)
        return run

    monkeypatch.setattr(periodic, "JOBS", [("fast", job("fast"), 60), ("slow", job("slow"), 3600)])
    last_run: dict[str, float] = {}

    await periodic.run_due(last_run, 1000.0)  # first tick: everything is due
    await periodic.run_due(last_run, 1030.0)  # nothing due yet
    await periodic.run_due(last_run, 1061.0)  # only the fast one
    await periodic.run_due(last_run, 4601.0)  # both again
    assert calls == ["fast", "slow", "fast", "fast", "slow"]


async def test_a_failing_job_does_not_stop_the_others(monkeypatch):
    calls: list[str] = []

    async def broken():
        raise RuntimeError("db down")

    async def fine():
        calls.append("fine")

    monkeypatch.setattr(periodic, "JOBS", [("broken", broken, 60), ("fine", fine, 60)])
    last_run: dict[str, float] = {}
    await periodic.run_due(last_run, 0.0)
    assert calls == ["fine"]
    # The failed job waits for its next interval instead of retrying every tick.
    assert last_run["broken"] == 0.0


def test_real_jobs_are_registered():
    names = {name for name, _, _ in periodic.JOBS}
    assert names == {"tournament rounds", "notification cleanup", "alerts maintenance", "daily auto list"}
