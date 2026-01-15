I've read the paper "Recursive Language Models" by Zhang, Kraska, and Khattab from MIT CSAIL (arXiv:2512.24601v1, December 31, 2025).

## Summary

This paper introduces **Recursive Language Models (RLMs)**, a general inference strategy that allows LLMs to process arbitrarily long prompts—up to two orders of magnitude beyond model context windows.

### Key Insight

The core innovation is treating **long prompts as part of an external environment** rather than feeding them directly into the neural network. The RLM:

1. Loads the input prompt as a variable in a Python REPL environment
2. Allows the LLM to programmatically examine, decompose, and peek into the prompt
3. Enables recursive self-calls over snippets of the prompt

### How It Works

Given a prompt P, the RLM:
- Initializes a REPL environment with P as a variable
- Provides the LLM with context about P (e.g., length)
- Permits the LLM to write code that peeks into and decomposes P
- Crucially, allows the LLM to construct sub-tasks and invoke itself recursively

### Key Results

- **Handles 10M+ tokens** effectively while base models fail beyond their context windows
- **Outperforms base LLMs by up to 2×** on long-context benchmarks
- **Comparable or cheaper costs** than alternatives like context compaction or retrieval agents
- On OOLONG-Pairs (quadratic complexity), RLMs achieved 58% F1 while base GPT-5 scored <0.1%

### Benchmarks Used

1. **S-NIAH**: Single needle-in-haystack (constant complexity)
2. **BrowseComp-Plus**: Multi-hop QA over 1000 documents (6-11M tokens)
3. **OOLONG**: Long reasoning with linear complexity
4. **OOLONG-Pairs**: Pairwise reasoning with quadratic complexity
5. **LongBench-v2 CodeQA**: Code repository understanding

### Emergent Patterns

RLMs exhibited several interesting behaviors without explicit training:
- **Filtering via code**: Using regex and model priors to narrow search space
- **Chunking and recursion**: Deferring reasoning chains to sub-LM calls
- **Answer verification**: Using sub-calls to verify answers with smaller contexts
- **Variable-based long outputs**: Building answers through REPL variables

### Limitations

- Optimal implementation mechanisms remain underexplored
- Asynchronous sub-calls could reduce runtime
- Deeper recursion layers not fully investigated
- Models not explicitly trained as RLMs—current models make inefficient decisions

This paper is highly relevant to Puffin's architecture, as it demonstrates how an orchestration layer can dramatically extend LLM capabilities through programmatic context management—similar to how Puffin manages Claude Code CLI interactions.