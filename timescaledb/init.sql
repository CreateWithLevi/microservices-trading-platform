-- TimescaleDB Initialization Script
-- This script creates the trades table and converts it to a hypertable for time-series optimization

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Create trades table for long-term trade history storage
-- This table will store all executed trades with detailed information
CREATE TABLE IF NOT EXISTS trades (
    -- Timestamp column (required for hypertable) - indexed for fast time-based queries
    trade_time TIMESTAMPTZ NOT NULL,

    -- Trade identification and details
    trade_id UUID DEFAULT gen_random_uuid(),
    asset_id VARCHAR(50) NOT NULL,
    action VARCHAR(10) NOT NULL CHECK (action IN ('BUY', 'SELL')),

    -- Trade volumes and pricing
    volume DECIMAL(15, 4) NOT NULL CHECK (volume > 0),
    price DECIMAL(15, 2) NOT NULL CHECK (price > 0),
    total_value DECIMAL(20, 2) NOT NULL,

    -- Risk check metadata
    risk_check_id VARCHAR(100),
    risk_approved BOOLEAN NOT NULL DEFAULT true,

    -- Metadata for auditing and debugging
    processed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    service_instance VARCHAR(100),

    -- Primary key constraint
    PRIMARY KEY (trade_time, trade_id)
);

-- Convert the trades table to a TimescaleDB hypertable
-- This enables automatic partitioning by time for efficient time-series queries
-- Partition by day (86400 seconds = 24 hours)
SELECT create_hypertable('trades', 'trade_time', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 day');

-- Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_trades_asset_id ON trades (asset_id, trade_time DESC);
CREATE INDEX IF NOT EXISTS idx_trades_action ON trades (action, trade_time DESC);
CREATE INDEX IF NOT EXISTS idx_trades_risk_approved ON trades (risk_approved, trade_time DESC);
CREATE INDEX IF NOT EXISTS idx_trades_trade_id ON trades (trade_id);

-- Create a continuous aggregate for hourly trade statistics (optional but useful for analytics)
-- This provides pre-computed aggregations for faster dashboard queries
CREATE MATERIALIZED VIEW IF NOT EXISTS trades_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', trade_time) AS bucket,
    asset_id,
    action,
    COUNT(*) AS trade_count,
    SUM(volume) AS total_volume,
    AVG(price) AS avg_price,
    SUM(total_value) AS total_value,
    MIN(price) AS min_price,
    MAX(price) AS max_price
FROM trades
GROUP BY bucket, asset_id, action
WITH NO DATA;

-- Refresh policy: automatically update the continuous aggregate every hour
SELECT add_continuous_aggregate_policy('trades_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- Create a retention policy to automatically drop old partitions (optional)
-- Uncomment below to enable automatic data retention (e.g., keep 90 days of data)
-- SELECT add_retention_policy('trades', INTERVAL '90 days', if_not_exists => TRUE);

-- Grant permissions to trading_user
GRANT ALL PRIVILEGES ON TABLE trades TO trading_user;
GRANT ALL PRIVILEGES ON TABLE trades_hourly TO trading_user;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'TimescaleDB initialization complete!';
    RAISE NOTICE 'Created tables: trades (hypertable)';
    RAISE NOTICE 'Created continuous aggregate: trades_hourly';
    RAISE NOTICE 'Indexes created for optimal query performance';
END $$;
