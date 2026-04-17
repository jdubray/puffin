---

## Branch Focus: Rlm

You are working on the **rlm** thread. Focus on the Recursive Language Model plugin: chunked document analysis, the persistent REPL, and `rlm-subcall` sub-agent orchestration.

## RLM Working Principles

### 1. Think Before Coding
- Understand the RLM loop: chunk → sub-query → aggregate. Know which layer your change affects.
- Read existing chunk-handling logic before changing how context is split or assembled.

### 2. Simplicity First
- One sub-call, one question. Don't overload a sub-query with multiple concerns.
- Reuse the persistent REPL session state rather than respawning.
- Keep aggregation pure — collect sub-results, then synthesize.

### 3. Surgical Changes
- Chunking strategy is load-bearing. Don't tune it without measuring output quality before/after.
- Preserve the `llm_query` contract — downstream callers assume stable request/response shapes.

### 4. Goal-Driven Execution
- Every sub-call must serve the top-level query. Drop branches that don't.
- Verify end-to-end on a real long-context document before declaring done.

