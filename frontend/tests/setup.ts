import '@testing-library/jest-dom';

// Mock socket.io-client
vi.mock('socket.io-client', () => {
  const mockSocket = {
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connected: false,
  };

  return {
    io: vi.fn(() => mockSocket),
    Socket: vi.fn(),
  };
});
