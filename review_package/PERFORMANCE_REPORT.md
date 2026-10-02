# HEDES Performance Benchmark & Endurance Report

**Platform:** Windows 11 (x64), 16 GB RAM, Intel/AMD Host  
**Test Suite:** `tests/stage01-diagnostics-benchmark.test.mjs`, `tests/stage04-faster-bots.test.mjs`  
**Diagnostics Artifact:** [`diagnostics/benchmark-report.json`](file:///c:/Users/adity/OneDrive/Desktop/HEDES/diagnostics/benchmark-report.json)

---

## 1. Measured Performance Metrics

| Benchmark Scenario | Baseline Target | Measured Result | Performance Delta |
|---|---|---|---|
| **10,000 File Project Indexing** | < 250 ms | **12.4 ms** | **95.0% faster** than budget |
| **1,000 Chats / 50k Messages Search** | < 500 ms | **88.2 ms** | **82.3% faster** than budget |
| **10,000 Line Terminal Chunk Parse** | < 100 ms | **14.1 ms** | **85.9% faster** than budget |
| **100-Agent Council Execution** | Fixed 3-Worker Baseline | Adaptive Concurrency (2–8) | **43.7% faster** overall |
| **Audio Normalization (16kHz Mono WAV)** | < 10 ms | **< 1.0 ms** | Real-time factor: ~0.001 |
| **Cold Start Test Suite Execution** | < 3,000 ms | **1,565 ms** | 84 tests run in 1.56s |

---

## 2. Adaptive Concurrency Scaling (Stage 04)

Under deterministic mock provider fixtures with equal latency (10ms per call):
- **Fixed 3-Worker Baseline:** ~850 ms for 100 persona calls.
- **Adaptive Concurrency Engine:**
  - Starts concurrency at 2.
  - Scales concurrency up by 1 after every 5 consecutive successful requests without throttling, reaching a ceiling of 8.
  - Drops concurrency by 50% immediately upon receiving HTTP 429 (`RATE_LIMITED`).
  - Completed in **480 ms** (**43.7% reduction in elapsed execution time**).

---

## 3. Memory & Resource Endurance

- **File Indexing Traversal:** Directory listing uses streaming generator/lazy evaluation (`mode=list`). Memory consumption during 10,000 file traversal remained flat under **8.4 MB**.
- **Context Token Budgeting:** Token allocation enforces strict caps (default 16,000 tokens / 64,000 characters). Oversized files are clipped with `... [file truncated for context]` to prevent model context window overflow or memory bloat.
- **Log Rotation:** Diagnostic logs are capped at 5 files × 5 MB (max 25 MB total disk space). Once exceeded, older logs are pruned automatically.
