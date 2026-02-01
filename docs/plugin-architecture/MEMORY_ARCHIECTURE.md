You reposted
Rohit
@rohit4verse
how to build an agent that never forgets 
3 months ago, I was rejected from a technical interview because I couldn’t build an agent that never forgets.
Every approach I knew worked… until it didn’t.
I walked into that room confident. I’d built chatbots. I understood embeddings. I knew how to use vector databases.
But when the interviewer asked me to design an agent that could remember a user’s preferences across weeks not just within a single conversation, I froze.
My instinct was the standard playbook: Store everything in a vector database and retrieve similar conversations when needed.
The questions that killed me were simple: What about scale? After a thousand sessions, how do you handle conflicting data? How do you stop it from faking memories just to fill the gaps?
I had no answer.
That failure forced me to actually deep dive and find a solution:
Most tutorials about "agents with memory" are teaching how to implement RAG for memory.
The problem isn't embeddings. It isn't token limits. It isn't even retrieval.
The problem is that memory is infrastructure, not a feature.
Here is the entire system I built to solve it and the code I used to do it.
The Real Problem With "Standard" Memory
Here is what I thought memory meant: Keeping the conversation history and stuffing it into the context window.
That works for about 10 exchanges. Then the context window fills up.
So you truncate old messages. Now your agent forgets the user is vegan and recommends a steakhouse.
You realize conversation history isn't memory it's just a chat log.
"Fine," I thought. "I'll embed every message and retrieve relevant ones using similarity search."
This worked better. For a while.
But after two weeks, the vector database had 500 entries. When the user asked, "What did I tell you about my work situation?" the retrieval system returned fragments from 12 different conversations.
The agent saw:
"I love my job" (Week 1)
"I'm thinking about quitting" (Week 2)
"My manager is supportive" (Week 1)
"My manager micromanages everything" (Week 2)
Which one is true?
The agent had no idea. It hallucinated a synthesis: "You love your supportive manager but you're thinking about quitting because of micromanagement."
Completely wrong. The user had switched jobs between Week 1 and Week 2.
This is the crucial realization: Embeddings measure similarity, not truth.
Vector databases have a blind spot: they don't understand time, context, or updates. They just spit back text that looks mathematically close to what you asked for. That isn’t remembering; it’s guessing.
The fix required a mental shift. Memory isn't a hard drive. It’s a process. You can't just store data; you have to give it a lifespan and let it evolve.
Short-Term Memory: The Solved Problem
Before tackling the hard part (long-term memory), we need to handle short-term continuity.
Short-term memory is the ability to remember what was said 30 seconds ago. This is actually a solved problem.
The solution is Checkpointing.
Every agent operates as a state machine. It receives input, updates internal state, calls tools, generates output, and updates state again. A checkpoint is a snapshot of this entire state at a specific moment.
This gives you three capabilities:
Determinism: Replay any conversation.
Recoverability: Resume exactly where you left off if the agent crashes.
Debuggability: Rewind to inspect the agent's "thoughts."
In production, I use Postgres-backed checkpointers. Here is the pattern:
checkpoint code in python
This handles the "now." But checkpoints are ephemeral. They don't build wisdom. For that, we need Long-Term Architectures.
Long-Term Memory Architectures
After months of failure, I found two architectures that actually work.
Architecture A: File-Based Memory (The Self-Organizing System)
This mimics how humans categorize knowledge. It works best for assistants, therapists, or companions.
The Three-Layer Hierarchy:
Layer 1: Resources (Raw Data). The source of truth. Unprocessed logs, uploads, transcripts. Immutable and timestamped.
Layer 2: Items (Atomic Facts). Discrete facts extracted from resources ("User prefers Python," "User is allergic to shellfish").
Layer 3: Categories (Evolving Summaries). The high-level context. Items are grouped into files like work_preferences.md or personal_life.md.
The Write Path: Active Memorization
When new information arrives, the system doesn't just file it away it processes it. It pulls up the existing summary for that category and actively weaves the new detail into the narrative. This handles contradictions automatically: if a user mentions they’ve switched to Rust, the system doesn't just add 'Rust' to the list; it rewrites the profile to replace the old preference
python
import json

class FileBasedMemory:
    def memorize(self, conversation_text, user_id):
        # Stage 1: Resource Ingestion (The Source of Truth)
        # Always save the raw input first. This allows for traceability.
        resource_id = self.save_resource(user_id, conversation_text)
        
        # Stage 2: Extraction
        # Extract atomic facts from the conversation.
        items = self.extract_items(conversation_text)
        
        # Stage 3: Batching (The Fix)
        # Group items by category to avoid opening/writing files multiple times.
        # Structure: { "work_life": ["User hates Java", "User loves Python"], ... }
        updates_by_category = {}
        for item in items:
            cat = self.classify_item(item)
            if cat not in updates_by_category:
                updates_by_category[cat] = []
            updates_by_category[cat].append(item['content'])
            
            # Link item to the specific resource for traceability
            self.save_item(user_id, category=cat, item=item, source_resource_id=resource_id)

        # Stage 4: Evolve Summaries (One Write Per Category)
        for category, new_memories in updates_by_category.items():
            existing_summary = self.load_category(user_id, category)
            
            # We pass the LIST of new memories, not just one
            updated_summary = self.evolve_summary(
                existing=existing_summary,
                new_memories=new_memories
            )
            
            self.save_category(user_id, category, updated_summary)

    def extract_items(self, text):
        """Use LLM to extract atomic facts"""
        prompt = f"""Extract discrete facts from this conversation.
        Focus on preferences, behaviors, and important details.
        Conversation: {text}
        Return as JSON list of items."""
        return llm.invoke(prompt)

    def evolve_summary(self, existing, new_memories):
        """
        Update category summary with a BATCH of new information.
        """
        # Convert list to bullet points for the prompt
        memory_list_text = "\n".join([f"- {m}" for m in new_memories])
        
        prompt = f"""You are a Memory Synchronization Specialist.
        
        Topic Scope: User Profile
        
        ## Original Profile
        {existing if existing else "No existing profile."}
        
        ## New Memory Items to Integrate
        {memory_list_text}
        
        # Task
        1. Update: If new items conflict with the Original Profile, overwrite the old facts.
        2. Add: If items are new, append them logically.
        3. Output: Return ONLY the updated markdown profile."""
        
        return llm.invoke(prompt)

    # Helper stubs
    def save_resource(self, user_id, text): pass
    def save_item(self, user_id, category, item, source_resource_id): pass
    def save_category(self, user_id, category, content): pass
    def load_category(self, user_id, category): return ""
    def classify_item(self, item): return "general"
The Read Path (Tiered Retrieval): To save tokens, you don't pull everything.
Pull Category Summaries.
Ask LLM: "Is this enough?"
If yes -> Respond.
If no -> Drill down into specific items.
python
class FileBasedRetrieval:
    def retrieve(self, query, user_id):
        # Stage 1: Category Selection (The Fix)
        # Instead of loading ALL content, we just list category NAMES and ask
        # the LLM which ones might contain the answer.
        all_categories = self.list_categories(user_id)
        relevant_categories = self.select_relevant_categories(query, all_categories)
        
        # Load only the relevant summaries
        summaries = {cat: self.load_category(user_id, cat) 
                     for cat in relevant_categories}
        
        # Stage 2: Sufficiency Check
        # Check if the high-level summaries answer the query
        if self.is_sufficient(query, summaries):
            return summaries
        
        # Stage 3: Hierarchical Search
        # If summaries are vague, generate a specific query to find atomic items
        # or raw resources.
        search_query = self.generate_search_query(query, summaries)
        
        # Search Level 1: Atomic Items (Extracted facts)
        items = self.search_items(user_id, search_query)
        if items:
            return items
            
        # Search Level 2: Raw Resources (Full text search fallback)
        resources = self.search_resources(user_id, search_query)
        return resources

    def select_relevant_categories(self, query, categories):
        """Filter to only the categories likely to hold the answer"""
        prompt = f"""Query: {query}
        Available Categories: {', '.join(categories)}
        
        Return a JSON list of the categories that are most relevant to this query."""
        return llm.invoke(prompt)

    def is_sufficient(self, query, summaries):
        prompt = f"""Query: {query}
        Summaries: {summaries}
        Can you answer the query comprehensively with just these summaries? YES/NO"""
        return 'YES' in llm.invoke(prompt)
This works beautifully for narrative coherence. But it struggles with complex relationships. For that, you need graphs.
Architecture B: Context-Graph Memory (The Knowledge Web)
File-based memory struggles with complex relationships. For precise systems (CRM, Research), you need a Graph.
Hybrid Structure
Vector store for discovery, used to surface related or similar text.
Knowledge graph for precision, storing facts as subject–predicate–object relationships.
Conflict resolution
We also built in conflict resolution. If the graph currently says the user works at Google, but a new message places them at OpenAI, the system doesn't just add a second job. Instead, it recognizes the contradiction, archives the Google connection as 'past history,' and makes OpenAI the active employer.
Graph-based memory with conflict resolution
Retrieval involves running parallel searches (Vector + Graph traversal) and merging the results
Graph-based hybrid retrieval
Hybrid Search
Retrieval runs two searches in parallel:
Vector Search: Find semantically similar conversations.
Graph Traversal: Find entities connected to the query.
The results merge into a unified context. This prevents the "remembers everything but knows nothing" problem.
Memory refresh, Decay, and Cron jobs
Here is what nobody tells you: Memory must decay.
"Never forget" doesn't mean "remember every single token." It means "remember what matters."
If you don't prune your database, your agent becomes confused, slow, and expensive.
I run background Cron jobs to keep the system healthy:
Nightly Consolidation
Every night at 3 AM, a background process reviews the day's conversations. It looks for patterns the agent missed during live operation. It merges redundant memories. It promotes frequently-accessed items to higher-priority storage.
Weekly Summarization
Once a week, the system re-summarizes category files. It compresses old items into higher-level insights. It prunes memories that haven't been accessed in 90 days.
Monthly Re-indexing
On a monthly basis, we run a full re-index of the memory store.
Embeddings are rebuilt with the latest model version, and graph edges are adjusted based on real usage.
Anything that hasn’t been touched in a while gets archived.
python
# Memory maintenance cron job
class MemoryMaintenance:
    def run_nightly_consolidation(self, user_id):
        """Run every night to consolidate memories"""
        # Get today's conversations
        recent_memories = self.get_memories_since(user_id, hours=24)
        
        # Identify redundant memories
        duplicates = self.find_duplicates(recent_memories)
        
        # Merge duplicates
        for group in duplicates:
            merged = self.merge_memories(group)
            self.replace_memories(group, merged)
        
        # Promote frequently accessed memories
        hot_memories = self.get_high_access_memories(user_id)
        for memory in hot_memories:
            self.increase_priority(memory)
    
    def run_weekly_summarization(self, user_id):
        """Run weekly to compress old memories"""
        # Get memories older than 30 days
        old_memories = self.get_memories_older_than(user_id, days=30)
        
        # Group by category
        categories = self.group_by_category(old_memories)
        
        # Summarize each category
        for category, memories in categories.items():
            summary = self.create_summary(memories)
            self.archive_old_items(memories)
            self.save_summary(user_id, category, summary)
        
        # Prune rarely accessed memories
        stale = self.get_memories_not_accessed(user_id, days=90)
        self.archive_memories(stale)
    
    def run_monthly_reindex(self, user_id):
        """Run monthly to optimize the memory store"""
        all_memories = self.get_all_memories(user_id)
        
        # Regenerate embeddings
        for memory in all_memories:
            new_embedding = self.generate_embedding(memory.text)
            memory.embedding = new_embedding
        
        # Re-weight graph edges
        if self.using_graph:
            self.graph.reweight_edges_by_access()
        
        # Archive dead nodes
        dead_nodes = self.graph.find_unused_nodes(days=180)
        self.graph.archive_nodes(dead_nodes)
This maintenance keeps memory systems healthy for months.
Without it, they rot.
How retrieval works at inference time
Most retrieval systems fail because they rely solely on vector similarity. That’s a mistake. A robust memory system works backwards from the constraints of the context window. It starts with a broad search using a synthesized query, not the raw user input. Then, it treats those search results as prospects, not answers. We filter those prospects through a "relevance scorer" and a "time-decay" function. This ensures that a slightly less relevant but highly recent memory often beats a perfect match from six months ago. The result is a prompt that contains only the 5-10 memory tokens that actually move the needle, rather than a wall of similar-sounding text.
python
# Retrieval and injection logic
class MemoryRetrieval:
    def retrieve_for_inference(self, user_message, user_id, max_tokens=2000):
        # Stage 1: Generate search query
        search_query = self.generate_query(user_message)
        
        # Stage 2: Semantic search
        candidates = self.vector_store.search(
            query=search_query,
            user_id=user_id,
            top_k=20
        )
        
        # Stage 3: Relevance filtering
        relevant = []
        for candidate in candidates:
            score = self.calculate_relevance(
                candidate, 
                user_message
            )
            if score > 0.7:
                relevant.append((score, candidate))
        
        # Stage 4: Temporal ranking
        ranked = []
        for score, memory in relevant:
            age_days = (now() - memory.timestamp).days
            time_decay = 1.0 / (1.0 + (age_days / 30))
            final_score = score * time_decay
            ranked.append((final_score, memory))
        
        ranked.sort(reverse=True, key=lambda x: x[0])
        
        # Stage 5: Context assembly
        selected_memories = []
        token_count = 0
        
        for score, memory in ranked:
            memory_tokens = self.count_tokens(memory.text)
            if token_count + memory_tokens > max_tokens:
                break
            
            selected_memories.append({
                'text': memory.text,
                'timestamp': memory.timestamp,
                'confidence': score
            })
            token_count += memory_tokens
        
        return self.format_memory_context(selected_memories)
    
    def format_memory_context(self, memories):
        """Format memories for injection into prompt"""
        context = "=== RELEVANT MEMORIES ===\n\n"
        
        for mem in memories:
            context += f"[{mem['timestamp']}] (confidence: {mem['confidence']:.2f})\n"
            context += f"{mem['text']}\n\n"
        
        context += "=== END MEMORIES ===\n"
        return context
This ensures the agent sees only what it needs. Nothing more. Nothing less.
Why most people fail at this
After building this system, I understood why I failed that interview. Most implementations fail in production because they make five critical mistakes:
Mistake 1: Storing raw conversations forever Conversations are noisy. If you store every "um" and "like," your memory becomes polluted. Extract facts, not transcripts.
Mistake 2: Blind embedding usage Embeddings find similarity, not truth. "I love my job" and "I hate my job" embed very similarly. You need resolution logic.
Mistake 3: No memory decay Without decay, your agent drowns in the past. It remembers your vacation plans from two years ago but forgets your current deadline.
Mistake 4: No write rules If the agent writes to memory whenever it wants, it will write junk. Define explicit rules for what deserves to be remembered.
Mistake 5: Treating memory as chat history This is the fatal mistake. Chat history is ephemeral. Memory is a structured representation of what was learned.
The Mental model
The real breakthrough happened when we stopped looking at agents as simple chatbots and started treating them like operating systems. An agent needs the exact same capabilities:
Process Management: Track multiple concurrent tasks.
Memory Management: Allocate, update, and free knowledge.
I/O Management: Interface with tools and users.
Most importantly, it requires a sophisticated memory architecture. You need "RAM" for the fast, volatile context of the current conversation, but you also need a "hard drive" a persistent, indexed way to store knowledge that survives after the session ends. If you don't run regular maintenance on that memory, much like garbage collection, the system eventually breaks down.
The Before and After
Three months ago:
basic memory
Today:
after applying hybrid architecture
The difference between a chatbot and a companion is memory.
The difference between memory and good memory is architecture.
If you're building agents, this is no longer optional. Users expect persistence. They expect learning. They expect the agent to remember who they are.
Three months ago, I couldn't build this. Now I've shipped agents that remember customer preferences across thousands of sessions.
The interview rejection that felt like failure became the catalyst for understanding what production systems actually require.
Storage is cheap. Structure is hard. But structure is what transforms a stateless language model into something that genuinely never forgets.
The agents of tomorrow won't just have more parameters or better training data. They'll have memory systems that learn, evolve, and improve with every interaction.
And now you know how to build them.