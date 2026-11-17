# Costs

Tasteloop itself is free. You pay for the AI calls with your own keys. The estimates below use Claude Sonnet at $2 per million input tokens and $10 per million output tokens; check current prices on anthropic.com.

| Step | Input | Output | Cost |
|---|---|---|---|
| Transcription with local whisper.cpp | | | free |
| Transcription via API (fallback, 30 s) | | | under $0.01 |
| Image analysis (image ~1,600 tokens + guide ~5,000 + reason) | ~7,500 | ~1,500 | **~$0.03** |
| Campaign brief (guide, image, analysis) | ~9,000 | ~2,500 | **~$0.05** |
| Re-analysis after a correction or a late voice note | | | ~$0.03 |
| Weekly digest (guide + ~10 analyses) | ~12,000 | ~4,000 | **~$0.07** per week |

**Per upload:** "Just keep" costs nothing, "brand" about $0.03, "campaign" about $0.08.

**Per month:** a team with 30 uploads and 4 digests pays roughly $1–2.

A longer guide costs proportionally more per analysis. To save, set `guide.analysis_context` to the sections that matter for images. Every call logs its tokens and cost (`kostenUsd`) in the bot and digest output.

Hardware: none beyond what you have. whisper.cpp needs about 1 GB of RAM while transcribing; the bot idles at well under 0.5 GB.
