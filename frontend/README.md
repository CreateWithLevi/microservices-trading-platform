# Trading Platform Frontend

Real-time dashboard for monitoring trade execution built with Next.js 14+.

## Features

- **Real-time Updates**: Live trade data via WebSocket (Socket.io)
- **Trade Statistics**: Live counts for total, approved, and rejected trades
- **Connection Status**: Visual indicator for WebSocket connection state
- **Responsive Design**: Built with Tailwind CSS
- **State Management**: Zustand for efficient state updates
- **Type Safety**: Full TypeScript support

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
- Service B running with WebSocket server on port 3001

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
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
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
├── app/                    # Next.js app directory
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Home page
│   └── globals.css        # Global styles
├── components/            # React components
│   └── RealTimeTrades.tsx # Main dashboard component
├── lib/                   # Utilities and hooks
│   ├── store.ts          # Zustand store
│   └── types.ts          # TypeScript types
├── tests/                # Test files
│   ├── setup.ts          # Test configuration
│   └── components/       # Component tests
├── Dockerfile            # Production Docker build
└── package.json          # Dependencies and scripts
```

## WebSocket Events

The frontend listens for the following Socket.io events:

### `trade:processed`

Emitted when a trade is processed (approved or rejected).

**Payload:**
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

## Development Notes

- The frontend automatically reconnects if the WebSocket connection is lost
- Trade history is limited to the last 100 trades to prevent memory issues
- Dark mode is the default theme
- All timestamps are displayed in local time
