// EchoAway voice agent — Phase 1 placeholder.
// Phase 5 wires up Gemini tool calling against the backend; Phase 6
// adds ai-coustics audio enhancement; Phase 7 adds Gradium voice;
// Phase 8 adds Tavily context.

const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:4000'
console.log(`[voice-agent] placeholder ready. Backend: ${backendUrl}`)
