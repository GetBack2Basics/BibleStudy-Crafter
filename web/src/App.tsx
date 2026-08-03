import StatusDock from './components/StatusDock'

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">BibleStudy-Crafter</h1>
        <p className="text-sm text-slate-400">Themed study generator — Phase 0 scaffold</p>
      </header>

      <main className="p-6">
        <p className="text-slate-400">
          Stack is up. Phase 1 (Bible corpus) next.
        </p>
      </main>

      <StatusDock />
    </div>
  )
}
