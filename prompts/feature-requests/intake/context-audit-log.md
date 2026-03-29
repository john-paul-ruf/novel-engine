The Context Wrangler (Sonnet model) makes intelligent decisions about what files to load for each agent call. But those decisions are opaque to the author. Did the wrangler include the scene outline? Why was the story bible excluded? What conversation history was compacted?

A context audit log should record, for each agent call, the wrangler's decision output: which files were required, relevant, excluded; how much of the conversation was kept; estimated token budget used. This lives in the chat UI as a collapsible panel ("Context Used for This Call") or in a dedicated analytics view.

Useful for debugging (why didn't the agent know about this detail?) and for understanding the system's behavior. Also surfaces opportunities for optimization ("we're always compacting conversation history, maybe budget needs adjustment").
