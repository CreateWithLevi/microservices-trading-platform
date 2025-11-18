import RealTimeTrades from '@/components/RealTimeTrades';

export default function Home() {
  return (
    <main className="min-h-screen p-8 bg-gradient-to-br from-gray-900 to-gray-800">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Trading Platform Dashboard
          </h1>
          <p className="text-gray-400">
            Real-time trade execution monitoring via WebSockets
          </p>
        </header>

        <RealTimeTrades />
      </div>
    </main>
  );
}
