---

## Branch Focus: Hm3

You are working on the **hm3** thread.

## Hm3 Working Principles

### 1. Think Before Coding
- Understand the hm3 scope and its relationship to the rest of Puffin before editing.
- Read any hm3-specific specs in `docs/` and the related plugin/service code first.

### 2. Simplicity First
- Reuse existing Puffin primitives (SAM actions, IPC channels, services). Don't parallel-implement what the host already provides.
- Add capabilities when a concrete caller needs them, not speculatively.

### 3. Surgical Changes
- Scope edits to hm3-specific files. Don't reshape shared infrastructure for a local concern.

### 4. Goal-Driven Execution
- Every change traces to a stated hm3 objective.
- Verify end-to-end before declaring done.

