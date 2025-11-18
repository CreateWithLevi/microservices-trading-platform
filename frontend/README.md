# Trading Platform Frontend

Comprehensive real-time trading dashboard built with Next.js 14+ featuring live trade monitoring, AI assistant, and historical data analysis.

## Features

- **Real-time Trade Ticker**: Live trade updates via WebSocket (Service N)
- **AI Trading Assistant**: Chat interface powered by Service D for market insights
- **Trade History**: Historical trade data from Service B/TimescaleDB
- **Real-time Statistics**: Live counts for total, approved, and rejected trades
- **Connection Status**: Visual indicator for WebSocket connection state
- **Responsive Design**: Mobile-first design with Tailwind CSS
- **State Management**: Zustand for efficient global state
- **Type Safety**: Full TypeScript support with strict mode

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **WebSocket**: Socket.io-client
- **Testing**: Vitest + React Testing Library

## Getting Started

### Prerequisites

- Node.js 20+
- Service N running (WebSocket server on port 3002)
- Service B running (API on port 3001) - for trade history
- Service D running (AI API on port 3004) - for chat

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:3000
```

### Environment Variables

Create a `.env.local` file:

```env
# WebSocket connection URL for Service N (Notification Service)
NEXT_PUBLIC_SOCKET_URL=http://localhost:3002

# Service B API URL (for trade history)
NEXT_PUBLIC_SERVICE_B_URL=http://localhost:3001

# Service D API URL (for AI chat)
NEXT_PUBLIC_SERVICE_D_URL=http://localhost:3004
```

### Testing

```bash
# Run tests
npm test

# Run tests with UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

## Docker

The frontend is included in the main `docker-compose.yml`:

```bash
# Start all services including frontend
cd ..
docker compose up --build

# Access at http://localhost:3000
```

## Project Structure

```
frontend/
├── app/                      # Next.js app directory
│   ├── layout.tsx           # Root layout
│   ├── page.tsx             # Home page (main dashboard)
│   └── globals.css          # Global styles
├── components/              # React components
│   ├── RealTimeTicker.tsx   # Live trade ticker
│   ├── ChatInterface.tsx    # AI chat component
│   └── TradeHistory.tsx     # Historical trades table
├── hooks/                   # Custom React hooks
│   ├── useWebSocket.ts      # WebSocket connection hook
│   └── useChat.ts           # Chat API hook
├── lib/                     # Utilities and services
│   ├── store.ts            # Zustand stores (trade & chat)
│   ├── types.ts            # TypeScript type definitions
│   └── services/
│       └── api.ts          # API client for Service B & D
├── tests/                   # Test files
│   ├── setup.ts            # Test configuration
│   └── components/         # Component tests
│       └── ChatInterface.test.tsx
├── Dockerfile              # Production Docker build
├── vitest.config.ts        # Vitest configuration
└── package.json            # Dependencies and scripts
```

## Service Integrations

### WebSocket (Service N)

**Event**: `trade.update`

Emitted when a trade is processed (approved or rejected).

```typescript
{
  id: string;
  assetId: string;
  action: 'BUY' | 'SELL';
  volume: number;
  price: number;
  totalValue: number;
  timestamp: string;
  status: 'approved' | 'rejected';
  rejectionReason?: string;
  checkId?: string;
}
```

### REST API (Service B)

**GET** `/api/v1/trades`

Fetch historical trade data with optional filters.

**Query Parameters**:
- `startDate`: Filter by start date (ISO 8601)
- `endDate`: Filter by end date (ISO 8601)
- `assetId`: Filter by specific asset
- `status`: Filter by trade status ('approved' | 'rejected')
- `action`: Filter by trade action ('BUY' | 'SELL')
- `limit`: Number of records to return (default: 50)
- `offset`: Pagination offset (default: 0)

### REST API (Service D)

**POST** `/api/v1/ask`

Send a question to the AI assistant.

**Request Body**:
```typescript
{
  question: string;
  context?: string; // Optional conversation context
}
```

**Response**:
```typescript
{
  answer: string;
  confidence?: number;
  sources?: string[];
}
```

## Development Notes

- The frontend automatically reconnects if the WebSocket connection is lost
- Live trade ticker is limited to the last 100 trades to prevent memory issues
- Dark mode is the default theme
- All timestamps are displayed in relative time format (e.g., "2 minutes ago")
- Chat messages include context from the last 5 messages for better AI responses
- Error boundaries handle API failures gracefully with user-friendly messages
