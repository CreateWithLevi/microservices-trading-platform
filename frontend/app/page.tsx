import RealTimeTicker from '@/components/RealTimeTicker';
import ChatInterface from '@/components/ChatInterface';
import TradeHistory from '@/components/TradeHistory';

export default function Home() {
  return (
    <main className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-gray-900 to-gray-800">
      <div className="max-w-[1920px] mx-auto">
        {/* Header */}
        <header className="mb-6">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
            Trading Platform Dashboard
          </h1>
          <p className="text-gray-400 text-sm md:text-base">
            Real-time trade monitoring, AI assistant, and historical data
          </p>
        </header>

        {/* Main Content */}
        <div className="grid grid-cols-1 gap-6">
          {/* Real-Time Ticker */}
          <div>
            <RealTimeTicker />
          </div>

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* AI Chat */}
            <div className="h-[600px]">
              <ChatInterface />
            </div>

            {/* Trade History */}
            <div className="h-[600px] overflow-y-auto">
              <TradeHistory />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
