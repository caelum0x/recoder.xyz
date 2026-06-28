"""Tests for recoder_billing.kit.money + currency (the pure, dep-free parts)."""

import pytest

from recoder_billing.kit import currency, money


@pytest.mark.unit
@pytest.mark.parametrize(
    ("cents", "expected"),
    [
        (100, "1"),
        (250, "2.50"),
        (99, "0.99"),
        (0, "0"),
        (12345, "123.45"),
    ],
)
def test_get_cents_in_dollar_string(cents, expected):
    assert money.get_cents_in_dollar_string(cents) == expected


@pytest.mark.unit
def test_decimal_factor_zero_decimal_vs_standard():
    assert currency.get_currency_decimal_factor("usd") == 100
    assert currency.get_currency_decimal_factor(currency.PresentmentCurrency.usd) == 100
    assert currency.get_currency_decimal_factor("jpy") == 1
    assert currency.get_currency_decimal_factor("krw") == 1


@pytest.mark.unit
def test_minimum_currency_amount():
    assert currency.get_minimum_currency_amount("usd") == 50
    assert currency.get_minimum_currency_amount("gbp") == 40
    # Unknown currency falls back to the default minimum.
    assert currency.get_minimum_currency_amount("xyz") == (
        currency.MINIMUM_PRICE_PER_CURRENCY_DEFAULT
    )


@pytest.mark.unit
def test_maximum_currency_amount_default_fallback():
    assert currency.get_maximum_currency_amount("usd") == (
        currency.MAXIMUM_PRICE_PER_CURRENCY_DEFAULT
    )
    assert currency.get_maximum_currency_amount("idr") == 16_000_000_00
    assert currency.get_maximum_currency_amount("xyz") == (
        currency.MAXIMUM_PRICE_PER_CURRENCY_DEFAULT
    )
