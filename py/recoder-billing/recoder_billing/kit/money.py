"""Money formatting helpers. Fused from polar/kit/money.py.

Amounts are stored as integer minor units (e.g. cents). These helpers render the
minor-unit integer as a major-unit string without introducing float drift in the
common whole-dollar case.
"""


def get_cents_in_dollar_string(cents: int) -> str:
    """Render an integer cent amount as a dollar string (no float drift on whole dollars)."""
    dollars = cents / 100
    if cents % 100 == 0:
        return str(round(dollars))
    return f"{round(dollars, 2):.2f}"
