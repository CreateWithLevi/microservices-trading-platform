"""
Pytest configuration and fixtures for Service D tests
"""

import pytest


@pytest.fixture
def sample_buy_signal() -> dict:
    """Fixture providing a sample buy signal"""
    return {
        "signal": "BUY BATTERY_GRID_01 volume 50 MWh",
        "context": {"asset_type": "battery", "market_condition": "stable"},
    }


@pytest.fixture
def sample_sell_signal() -> dict:
    """Fixture providing a sample sell signal"""
    return {
        "signal": "SELL BATTERY_GRID_01 volume 30 MWh - bearish trend",
        "context": {"asset_type": "battery", "market_condition": "declining"},
    }


@pytest.fixture
def sample_neutral_signal() -> dict:
    """Fixture providing a sample neutral signal"""
    return {"signal": "Market conditions unclear for BATTERY_GRID_01"}
