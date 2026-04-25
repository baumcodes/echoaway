export function App() {
  return (
    <main>
      <header>
        <h1>EchoAway Voice Concierge</h1>
        <p>Phase 1 placeholder. The polished UI lands in Phase 3.</p>
      </header>
      <section>
        <p>
          Backend URL:{' '}
          <code>{import.meta.env.VITE_BACKEND_URL ?? '(unset)'}</code>
        </p>
      </section>
    </main>
  )
}
