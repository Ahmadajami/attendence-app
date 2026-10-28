"""Schedule arithmetic: shift spans and pattern slots. No Odoo imports.

Times are float hours in [0, 24) as entered by HR ("from hour to hour").
A shift whose end is at or before its start ends the NEXT day, so 16 → 4 is
16:00 today to 04:00 tomorrow (720 minutes). There is no manual "night" box:
overnight is a property of the times (brief P2, P17).

Pattern slots follow the old ``rotation_math.py`` conventions: index 0 is the
anchor date, and Python floor division / modulo give the right slot for days
before the anchor.
"""
from datetime import date

MINUTES_PER_DAY = 24 * 60

WEEKLY = 'weekly'
CYCLE = 'cycle'
WEEKLY_SLOTS = 7
MAX_CYCLE_SLOTS = 28


def to_minutes(hours: float) -> int:
    """Float hours → whole minutes of the day (rounded, never 24:00)."""
    return int(round((hours or 0.0) * 60)) % MINUTES_PER_DAY


def crosses_midnight(start: float, end: float) -> bool:
    """True when the shift ends the next day (end at or before start)."""
    return to_minutes(end) <= to_minutes(start)


def span_minutes(start: float, end: float) -> int:
    """Length of the shift in minutes, overnight-safe.

    16 → 4 = 720, 0 → 8 = 480, 8 → 8 = 1440 (a full 24-hour shift).
    """
    start_m, end_m = to_minutes(start), to_minutes(end)
    if end_m <= start_m:
        end_m += MINUTES_PER_DAY
    return end_m - start_m


def required_minutes(span: int, break_minutes: int) -> int:
    """Default required time: the span minus the planned break, never < 0."""
    return max(0, span - max(0, break_minutes or 0))


def _intervals(start_m: int, end_m: int) -> list[tuple[int, int]]:
    """A daily window as intervals on a 0–2880 minute axis (two days)."""
    if end_m <= start_m:
        end_m += MINUTES_PER_DAY
    # Repeat the window on the next day too, so a shift starting in the
    # evening also meets the early-morning part of the night window.
    return [(start_m, end_m), (start_m + MINUTES_PER_DAY, end_m + MINUTES_PER_DAY)]


def overlap_minutes(start: float, end: float,
                    window_start: float, window_end: float) -> int:
    """Minutes of the shift that fall inside a daily window (e.g. 22 → 6)."""
    shift_start = to_minutes(start)
    shift_end = shift_start + span_minutes(start, end)
    window = _intervals(to_minutes(window_start), to_minutes(window_end))
    # The window may also have started the day before the shift.
    window.insert(0, (window[0][0] - MINUTES_PER_DAY,
                      window[0][1] - MINUTES_PER_DAY))
    return sum(max(0, min(shift_end, w_end) - max(shift_start, w_start))
               for w_start, w_end in window)


def is_night(start: float, end: float,
             window_start: float, window_end: float) -> bool:
    """Night shift: crosses midnight, or at least half of it is night time."""
    if crosses_midnight(start, end):
        return True
    span = span_minutes(start, end)
    return 2 * overlap_minutes(start, end, window_start, window_end) >= span


def sunday_index(day: date) -> int:
    """Weekday as a weekly-pattern slot: Sunday 0 … Saturday 6."""
    return (day.weekday() + 1) % WEEKLY_SLOTS


def slot_index(pattern_type: str, n_slots: int, day: date,
               anchor: date | None = None) -> int:
    """Which slot of a pattern applies on ``day``.

    * weekly: the weekday (Sunday = 0), whatever the anchor.
    * cycle: days since the anchor, modulo the number of slots. Correct
      for days before the anchor too (anchor − 1 is the last slot).
    """
    if pattern_type == WEEKLY:
        return sunday_index(day)
    if anchor is None:
        raise ValueError('A cycle pattern needs an anchor date.')
    return (day - anchor).days % max(1, n_slots)
