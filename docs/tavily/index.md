# Tavily API documentation

Reference docs for [Tavily](https://docs.tavily.com) — the travel
context enrichment provider used by `apps/voice-agent`'s
`searchTravelContext` tool (Phase 8 of [`PLAN.md`](../../PLAN.md)).

These pages were exported from `docs.tavily.com` so agents can work
offline. The canonical upstream index is
<https://docs.tavily.com/llms.txt>.

## Where to start

| If you want to…                                       | Read                                                       |
|-------------------------------------------------------|------------------------------------------------------------|
| Run a web search and get LLM-ready results            | [`rest_api_search.md`](./rest_api_search.md)               |
| Pull clean content from one or more known URLs        | [`rest_api_extract.md`](./rest_api_extract.md)             |
| Build a site map from a starting URL                  | [`rest_api_map.md`](./rest_api_map.md)                     |
| Crawl a site graph in parallel with extraction        | [`rest_api_crawl.md`](./rest_api_crawl.md)                 |
| Check the API key's remaining credits / usage         | [`rest_api_usage.md`](./rest_api_usage.md)                 |
| Use the official JS/TS SDK instead of raw HTTP        | [`javascript_sdk_reference.md`](./javascript_sdk_reference.md) |

## For this project

The voice agent's primary need is **search** — the
`searchTravelContext(query)` tool is a thin wrapper around
[`rest_api_search.md`](./rest_api_search.md). Extract / Map / Crawl are
documented for completeness but are not on the demo critical path.

## Auth

All endpoints authenticate with a bearer API key
(`Authorization: Bearer <TAVILY_API_KEY>`). The key lives in the root
`.env` as `TAVILY_API_KEY` — see [`../../README.md`](../../README.md)
§Environment.
