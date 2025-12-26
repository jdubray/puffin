 1. Three-Tier Memory Architecture (Factual, Experiential, Working)

  The paper distinguishes three functional memory types that map well to Puffin's needs:
  - Factual Memory: Store project context, user preferences, and file states
  - Experiential Memory: Store successful prompts, solution patterns, and learned workflows from past 3CLI sessions
  - Working Memory: Manage the current task's active context (current branch, active prompts, immediate goals)

  ---
  2. Hierarchical Memory Folding for Long Sessions

  When a task or subtask completes, compress the detailed trajectory into a high-level summary. Keep full detail only for the active subgoal. This prevents context overflow while preserving the ability to recall prior work.

  "HiAgent uses subgoals as memory units, retaining only active action-observation pairs and writing back a summary after subgoal completion."

  ---
  3. Experience Memory as Cases, Strategies, and Skills

  Store 3CLI experiences at multiple abstraction levels:
  - Cases: Raw prompt-response pairs that worked (for similar-task retrieval)
  - Strategies: Abstracted workflows like "how to refactor a module" or "how to debug API errors"
  - Skills: Reusable prompt templates or code snippets that can be invoked

  ---
  4. Graph-Based Memory for Project Knowledge

  Use a knowledge graph to represent project entities and their relationships (files, modules, dependencies, user stories). This enables:
  - Multi-hop reasoning about code dependencies
  - Semantic linking between requirements and implementations
  - Visualization of the development process

  "A-Mem organizes memories as interconnected notes, building a complete memory network."

  ---
  5. Memory Formation Through Reflection

  After each 3CLI session, automatically reflect on outcomes:
  - What worked? (Success patterns)
  - What failed? (Failure patterns to avoid)
  - What general insight can be extracted?

  "ExpeL autonomously gathers experience through trial-and-error, storing successful trajectories as exemplars while extracting textual insights to guide future actions."

  ---
  6. Temporal Knowledge Graphs for Project History

  Track how the codebase evolves over time using temporal metadata:
  - When was each decision made?
  - What was the context?
  - How did requirements change?

  This enables "time-travel" through project decisions and understanding why things are the way they are.

  ---
  7. Dual-Store Memory: Short-Term + Long-Term

  Implement a MemGPT-style architecture:
  - Short-term (active context): Current session, immediate files, recent prompts
  - Long-term (persistent store): Project history, accumulated insights, user preferences

  The system automatically pages information between stores based on relevance.

  ---
  8. Self-Evolving Memory with Consolidation

  Memory should not just accumulate—it should evolve:
  - Consolidate: Merge redundant entries
  - Update: Refine outdated information
  - Forget: Prune low-utility memories

  "Through mechanisms such as consolidation of correlated entries, conflict resolution, and adaptive pruning, the system ensures that memory remains generalizable, coherent, and efficient."

  ---
  9. Strategy Templates as Reusable Cognitive Scaffolds

  Extract and store high-level reasoning patterns:
  - "Buffer of Thoughts" style thought-templates for common tasks
  - Workflow patterns for recurring development activities (add feature → test → document)
  - These can be retrieved and instantiated for new but similar problems

  ---
  10. Shared Memory for Multi-Agent/Multi-Session Coordination

  Since Puffin manages multiple 3CLI sessions or branches:
  - Maintain a shared memory pool that different sessions can read/write
  - Track which session contributed what insight
  - Enable knowledge transfer across development threads

  "Memory Sharing enables agents to access and build on peers' accumulated insights asynchronously... suppressing contradictory conclusions and enhancing overall system efficiency."

  ---
  Bonus Insight: Token-Level Memory is Best for Your Use Case

  The paper concludes that token-level (explicit, symbolic) memory is ideal for:
  - High-stakes domains requiring verifiable provenance
  - Multi-turn chatbots and long-horizon agents
  - Systems requiring swift add/delete/update operations

  This aligns perfectly with Puffin's role as a tracking/orchestration layer where transparency and editability matter.cd