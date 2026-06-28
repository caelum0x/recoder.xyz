"""Currency rules + formatting. Fused from polar/kit/currency.py.

The self-contained parts — supported currencies, zero-decimal currency set, minor-unit
decimal factor, and Stripe-aligned min/max charge tables — are pure and need no deps.
Locale-aware ``format_currency`` defers to ``babel`` and imports it lazily so this
module loads in the pure spine; install the 'api' extra to use it.
"""

from decimal import Decimal
from enum import StrEnum
from typing import Any


class PresentmentCurrency(StrEnum):
    aed = "aed"
    aud = "aud"
    brl = "brl"
    cad = "cad"
    chf = "chf"
    cny = "cny"
    czk = "czk"
    dkk = "dkk"
    eur = "eur"
    gbp = "gbp"
    hkd = "hkd"
    huf = "huf"
    idr = "idr"
    ils = "ils"
    inr = "inr"
    jpy = "jpy"
    krw = "krw"
    mxn = "mxn"
    myr = "myr"
    nok = "nok"
    nzd = "nzd"
    php = "php"
    pln = "pln"
    ron = "ron"
    sek = "sek"
    sgd = "sgd"
    thb = "thb"
    try_ = "try"
    twd = "twd"
    usd = "usd"
    zar = "zar"


# Currencies whose minor unit equals the major unit (no cents).
_ZERO_DECIMAL_CURRENCIES: set[str] = {
    "bif",
    "clp",
    "djf",
    "gnf",
    "jpy",
    "kmf",
    "krw",
    "mga",
    "pyg",
    "rwf",
    "vnd",
    "vuv",
    "xaf",
    "xof",
    "xpf",
}


def get_currency_decimal_factor(currency: PresentmentCurrency | str) -> int:
    """Return the minor->major factor (100 for USD, 1 for JPY/zero-decimal)."""
    if str(currency).lower() in _ZERO_DECIMAL_CURRENCIES:
        return 1
    return 100


# Stripe-aligned minimum charge per currency, in minor units. The target-currency
# minimum must convert to at least ~$0.50 USD. Ref:
# https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts
MINIMUM_PRICE_PER_CURRENCY_DEFAULT = 50
MINIMUM_PRICE_PER_CURRENCY: dict[str, int] = {
    "usd": 50,
    "aud": 70,
    "brl": 250,
    "cad": 70,
    "chf": 50,
    "cny": 500,
    "czk": 1500,
    "dkk": 320,
    "eur": 50,
    "gbp": 40,
    "hkd": 400,
    "huf": 17500,
    "idr": 900000,
    "ils": 150,
    "inr": 6000,
    "jpy": 80,
    "krw": 800,
    "mxn": 900,
    "myr": 200,
    "nok": 500,
    "nzd": 90,
    "php": 3500,
    "pln": 200,
    "ron": 250,
    "sek": 500,
    "sgd": 70,
    "thb": 2000,
    "try": 3000,
    "twd": 2000,
    "zar": 900,
}

# Per-currency maximum charge in minor units; weak per-USD currencies get a higher
# ceiling so the effective USD cap stays consistent. Default applies otherwise.
MAXIMUM_PRICE_PER_CURRENCY_DEFAULT = 999_999_99
MAXIMUM_PRICE_PER_CURRENCY: dict[str, int] = {
    "usd": MAXIMUM_PRICE_PER_CURRENCY_DEFAULT,
    "eur": MAXIMUM_PRICE_PER_CURRENCY_DEFAULT,
    "gbp": MAXIMUM_PRICE_PER_CURRENCY_DEFAULT,
    "idr": 16_000_000_00,
}


def get_minimum_currency_amount(currency: PresentmentCurrency | str) -> int:
    """Minimum chargeable amount in minor units for ``currency``."""
    return MINIMUM_PRICE_PER_CURRENCY.get(
        str(currency).lower(), MINIMUM_PRICE_PER_CURRENCY_DEFAULT
    )


def get_maximum_currency_amount(currency: PresentmentCurrency | str) -> int:
    """Maximum chargeable amount in minor units for ``currency``."""
    return MAXIMUM_PRICE_PER_CURRENCY.get(
        str(currency).lower(), MAXIMUM_PRICE_PER_CURRENCY_DEFAULT
    )


def _require_babel() -> Any:
    try:
        from babel.numbers import format_currency as _fc  # type: ignore

        return _fc
    except ImportError as e:  # pragma: no cover - exercised only without babel
        raise RuntimeError(
            "babel is required for locale-aware currency formatting. "
            "Install the 'api' extra: pip install 'recoder-billing[api]'."
        ) from e


def format_currency(
    amount: int | Decimal | float,
    currency: PresentmentCurrency | str,
    *,
    locale: str = "en_US",
    decimal_quantization: bool = True,
) -> str:
    """Format a minor-unit ``amount`` as a localized currency string.

    Converts from the smallest currency unit (e.g. cents) to the major unit using the
    currency's decimal factor before formatting.
    """
    _fc = _require_babel()
    return _fc(
        amount / get_currency_decimal_factor(currency),
        str(currency).upper(),
        locale=locale,
        decimal_quantization=decimal_quantization,
    )
