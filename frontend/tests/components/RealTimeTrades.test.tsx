import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import RealTimeTrades from '@/components/RealTimeTrades';
import { useTradeStore } from '@/lib/store';
import type { TradeResult } from '@/lib/types';

// Mock socket instance that we'll control in tests
let mockSocketInstance: {
  on: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  connected: boolean;
};

// Mock socket.io-client
vi.mock('socket.io-client', () => {
  return {
    io: vi.fn(() => mockSocketInstance),
  };
});

describe('RealTimeTrades Component', () => {
  beforeEach(() => {
    // Reset the store before each test
    useTradeStore.setState({ trades: [], connectionStatus: 'disconnected' });

    // Create a fresh mock socket instance for each test
    mockSocketInstance = {
      on: vi.fn((event: string, callback: (data?: unknown) => void) => {
        // Auto-trigger connect for testing
        if (event === 'connect') {
          setTimeout(() => callback(), 0);
        }
      }),
      emit: vi.fn(),
      disconnect: vi.fn(),
      connected: false,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render the component with initial state', () => {
    render(<RealTimeTrades />);

    expect(screen.getByText('Live Trades')).toBeInTheDocument();
    expect(screen.getByText('Total Trades')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('should show "Waiting for trades..." when connected but no trades', async () => {
    render(<RealTimeTrades />);

    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    expect(screen.getByText('Waiting for trades...')).toBeInTheDocument();
  });

  it('should register socket event listeners on mount', () => {
    render(<RealTimeTrades />);

    expect(mockSocketInstance.on).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(mockSocketInstance.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    expect(mockSocketInstance.on).toHaveBeenCalledWith('connect_error', expect.any(Function));
    expect(mockSocketInstance.on).toHaveBeenCalledWith('trade.update', expect.any(Function));
  });

  it('should update store when trade event is received', async () => {
    // Setup mock to capture the trade.update callback
    let tradeUpdateCallback: ((trade: TradeResult) => void) | null = null;

    mockSocketInstance.on.mockImplementation((event: string, callback: (data?: unknown) => void) => {
      if (event === 'trade.update') {
        tradeUpdateCallback = callback as (trade: TradeResult) => void;
      } else if (event === 'connect') {
        setTimeout(() => callback(), 0);
      }
    });

    render(<RealTimeTrades />);

    // Wait for component to mount and register listeners
    await waitFor(() => {
      expect(tradeUpdateCallback).not.toBeNull();
    });

    // Simulate receiving a trade event
    const mockTrade: TradeResult = {
      id: 'test-123',
      assetId: 'BATTERY_GRID_01',
      action: 'BUY',
      volume: 50,
      price: 75.5,
      totalValue: 3775,
      timestamp: new Date().toISOString(),
      status: 'approved',
      checkId: 'check-456',
    };

    tradeUpdateCallback!(mockTrade);

    // Verify trade was added to store
    await waitFor(() => {
      const { trades } = useTradeStore.getState();
      expect(trades).toHaveLength(1);
      expect(trades[0]).toEqual(mockTrade);
    });
  });

  it('should display trades in the table', async () => {
    // Manually add a trade to the store
    const mockTrade: TradeResult = {
      id: 'test-123',
      assetId: 'BATTERY_GRID_01',
      action: 'BUY',
      volume: 50,
      price: 75.5,
      totalValue: 3775,
      timestamp: new Date().toISOString(),
      status: 'approved',
      checkId: 'check-456',
    };

    useTradeStore.setState({ trades: [mockTrade], connectionStatus: 'connected' });

    render(<RealTimeTrades />);

    await waitFor(() => {
      expect(screen.getByText('BATTERY_GRID_01')).toBeInTheDocument();
      expect(screen.getByText('BUY')).toBeInTheDocument();
      expect(screen.getByText('50 MWh')).toBeInTheDocument();
      expect(screen.getByText('$75.50')).toBeInTheDocument();
      expect(screen.getByText('$3775.00')).toBeInTheDocument();
      expect(screen.getByText('✓ Approved')).toBeInTheDocument();
    });
  });

  it('should show correct stats for approved and rejected trades', () => {
    const approvedTrade: TradeResult = {
      id: 'test-1',
      assetId: 'BATTERY_GRID_01',
      action: 'BUY',
      volume: 50,
      price: 75.5,
      totalValue: 3775,
      timestamp: new Date().toISOString(),
      status: 'approved',
    };

    const rejectedTrade: TradeResult = {
      id: 'test-2',
      assetId: 'BATTERY_GRID_02',
      action: 'SELL',
      volume: 150,
      price: 80,
      totalValue: 0,
      timestamp: new Date().toISOString(),
      status: 'rejected',
      rejectionReason: 'Volume exceeds limit',
    };

    useTradeStore.setState({
      trades: [approvedTrade, rejectedTrade],
      connectionStatus: 'connected',
    });

    render(<RealTimeTrades />);

    expect(screen.getByText('2')).toBeInTheDocument(); // Total trades
    expect(screen.getByText('1')).toBeInTheDocument(); // Approved (in the stats section)
  });

  it('should disconnect socket on unmount', () => {
    const { unmount } = render(<RealTimeTrades />);

    unmount();

    expect(mockSocketInstance.disconnect).toHaveBeenCalled();
  });
});
