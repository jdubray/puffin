#!/usr/bin/env python3
"""
RLM Document Plugin - Python REPL

A JSON-RPC based REPL for document analysis. Provides stateful
document access with peek, grep, chunking, and buffer operations.

Communication Protocol:
- Request:  {"jsonrpc": "2.0", "id": "...", "method": "...", "params": {...}}
- Response: {"jsonrpc": "2.0", "id": "...", "result": {...}}
- Error:    {"jsonrpc": "2.0", "id": "...", "error": {"code": N, "message": "..."}}
"""

import sys
import json
import re
import traceback
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple


# Error codes (JSON-RPC standard + custom)
ERROR_PARSE = -32700
ERROR_INVALID_REQUEST = -32600
ERROR_METHOD_NOT_FOUND = -32601
ERROR_INVALID_PARAMS = -32602
ERROR_INTERNAL = -32603
ERROR_NOT_INITIALIZED = -32000
ERROR_FILE_NOT_FOUND = -32001
ERROR_INVALID_RANGE = -32002


class RlmRepl:
    """RLM Document REPL Handler"""

    def __init__(self):
        self.initialized = False
        self.document_path: Optional[str] = None
        self.content: Optional[str] = None
        self.content_lines: Optional[List[str]] = None
        self.chunk_size: int = 4000
        self.chunk_overlap: int = 200
        self.chunks: List[Dict] = []
        self.buffers: List[Dict] = []
        self.loaded_at: Optional[str] = None

    def handle_request(self, request: Dict) -> Dict:
        """Handle a JSON-RPC request and return response"""
        req_id = request.get("id")
        method = request.get("method")
        params = request.get("params", {})

        # Validate request
        if not method:
            return self._error(req_id, ERROR_INVALID_REQUEST, "Missing method")

        # Route to handler
        handler = getattr(self, f"method_{method}", None)
        if not handler:
            return self._error(req_id, ERROR_METHOD_NOT_FOUND, f"Unknown method: {method}")

        try:
            result = handler(params)
            return self._result(req_id, result)
        except Exception as e:
            return self._error(req_id, ERROR_INTERNAL, str(e))

    def _result(self, req_id: Any, result: Any) -> Dict:
        """Create success response"""
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": result
        }

    def _error(self, req_id: Any, code: int, message: str) -> Dict:
        """Create error response"""
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {
                "code": code,
                "message": message
            }
        }

    def _require_init(self):
        """Raise if not initialized"""
        if not self.initialized:
            raise RuntimeError("REPL not initialized. Call 'init' first.")

    # ==================== RPC Methods ====================

    def method_init(self, params: Dict) -> Dict:
        """Initialize REPL with document"""
        document_path = params.get("documentPath")
        if not document_path:
            raise ValueError("documentPath is required")

        self.chunk_size = params.get("chunkSize", 4000)
        self.chunk_overlap = params.get("chunkOverlap", 200)

        # Load document
        try:
            with open(document_path, "r", encoding="utf-8") as f:
                self.content = f.read()
        except FileNotFoundError:
            raise FileNotFoundError(f"Document not found: {document_path}")
        except Exception as e:
            raise RuntimeError(f"Failed to read document: {e}")

        self.document_path = document_path
        self.content_lines = self.content.split("\n")
        self.loaded_at = datetime.utcnow().isoformat() + "Z"
        self.buffers = []

        # Compute chunks
        self._compute_chunks()

        self.initialized = True

        return {
            "status": "initialized",
            "documentPath": document_path,
            "contentLength": len(self.content),
            "lineCount": len(self.content_lines),
            "chunkCount": len(self.chunks),
            "loadedAt": self.loaded_at
        }

    def method_peek(self, params: Dict) -> Dict:
        """View content range by character positions"""
        self._require_init()

        start = params.get("start", 0)
        end = params.get("end", len(self.content))

        # Validate range
        if start < 0:
            start = 0
        if end > len(self.content):
            end = len(self.content)
        if start >= end:
            raise ValueError(f"Invalid range: {start}-{end}")

        content = self.content[start:end]
        line_start = self._char_to_line(start)
        line_end = self._char_to_line(end - 1) if end > 0 else line_start

        return {
            "content": content,
            "start": start,
            "end": end,
            "length": len(content),
            "lineStart": line_start,
            "lineEnd": line_end
        }

    def method_grep(self, params: Dict) -> Dict:
        """Search for pattern in document"""
        self._require_init()

        pattern = params.get("pattern")
        if not pattern:
            raise ValueError("pattern is required")

        max_matches = params.get("maxMatches", 10)
        context_lines = params.get("contextLines", 2)

        try:
            regex = re.compile(pattern, re.IGNORECASE | re.MULTILINE)
        except re.error as e:
            raise ValueError(f"Invalid regex pattern: {e}")

        matches = []
        for match in regex.finditer(self.content):
            if len(matches) >= max_matches:
                break

            start = match.start()
            end = match.end()
            line_num = self._char_to_line(start)

            # Get context
            context_start = max(0, line_num - context_lines - 1)
            context_end = min(len(self.content_lines), line_num + context_lines)
            context = "\n".join(self.content_lines[context_start:context_end])

            matches.append({
                "match": match.group(),
                "start": start,
                "end": end,
                "line": line_num,
                "context": context,
                "contextLineStart": context_start + 1,
                "contextLineEnd": context_end
            })

        return {
            "pattern": pattern,
            "matchCount": len(matches),
            "matches": matches,
            "truncated": len(matches) >= max_matches
        }

    def method_get_chunks(self, params: Dict) -> Dict:
        """Get chunk metadata"""
        self._require_init()

        include_content = params.get("includeContent", False)

        if include_content:
            return {
                "chunkCount": len(self.chunks),
                "chunks": self.chunks
            }
        else:
            # Return metadata only
            chunks_meta = [
                {k: v for k, v in chunk.items() if k != "content"}
                for chunk in self.chunks
            ]
            return {
                "chunkCount": len(self.chunks),
                "chunks": chunks_meta
            }

    def method_get_chunk(self, params: Dict) -> Dict:
        """Get a specific chunk by index"""
        self._require_init()

        index = params.get("index")
        if index is None:
            raise ValueError("index is required")

        if index < 0 or index >= len(self.chunks):
            raise ValueError(f"Chunk index out of range: {index}")

        return {
            "chunk": self.chunks[index]
        }

    def method_eval(self, params: Dict) -> Dict:
        """Execute Python code in REPL context"""
        self._require_init()

        code = params.get("code")
        if not code:
            raise ValueError("code is required")

        # Create execution context
        context = {
            "content": self.content,
            "lines": self.content_lines,
            "chunks": self.chunks,
            "buffers": self.buffers,
            "peek": lambda s, e: self.content[s:e],
            "grep": lambda p: [m.group() for m in re.finditer(p, self.content)],
            "add_buffer": lambda t, l=None: self._add_buffer(t, l),
        }

        # Execute
        try:
            # Try as expression first
            result = eval(code, {"__builtins__": {}}, context)
            return {"result": result, "type": type(result).__name__}
        except SyntaxError:
            # Try as statement
            exec(code, {"__builtins__": {}}, context)
            return {"result": None, "type": "None"}

    def method_add_buffer(self, params: Dict) -> Dict:
        """Add content to buffer"""
        self._require_init()

        content = params.get("content")
        if content is None:
            raise ValueError("content is required")

        label = params.get("label")
        return self._add_buffer(content, label)

    def method_get_buffers(self, params: Dict) -> Dict:
        """Get all buffers"""
        self._require_init()

        return {
            "bufferCount": len(self.buffers),
            "buffers": self.buffers
        }

    def method_query(self, params: Dict) -> Dict:
        """
        Execute a query against the document.
        This is a placeholder - actual LLM integration would go here.
        For now, returns document statistics and matching chunks.
        """
        self._require_init()

        query = params.get("query")
        if not query:
            raise ValueError("query is required")

        # Simple keyword extraction
        keywords = [w.lower() for w in re.findall(r'\b\w+\b', query) if len(w) > 3]

        # Find relevant chunks
        relevant_chunks = []
        for chunk in self.chunks:
            chunk_lower = chunk["content"].lower()
            score = sum(1 for kw in keywords if kw in chunk_lower)
            if score > 0:
                relevant_chunks.append({
                    "chunkIndex": chunk["index"],
                    "score": score,
                    "preview": chunk["content"][:200] + "..." if len(chunk["content"]) > 200 else chunk["content"]
                })

        # Sort by relevance
        relevant_chunks.sort(key=lambda x: x["score"], reverse=True)

        return {
            "query": query,
            "keywords": keywords,
            "relevantChunks": relevant_chunks[:5],
            "totalChunks": len(self.chunks),
            "note": "Full LLM integration pending - this returns keyword-matched chunks"
        }

    def method_shutdown(self, params: Dict) -> Dict:
        """Graceful shutdown"""
        return {"status": "shutting_down"}

    # ==================== Helper Methods ====================

    def _compute_chunks(self):
        """Compute document chunks"""
        self.chunks = []
        start = 0
        step = self.chunk_size - self.chunk_overlap

        while start < len(self.content):
            end = min(start + self.chunk_size, len(self.content))
            chunk_content = self.content[start:end]

            line_start = self._char_to_line(start)
            line_end = self._char_to_line(end - 1) if end > start else line_start

            self.chunks.append({
                "id": f"chunk_{len(self.chunks):03d}",
                "index": len(self.chunks),
                "start": start,
                "end": end,
                "length": end - start,
                "lineStart": line_start,
                "lineEnd": line_end,
                "content": chunk_content
            })

            start += step

            # Avoid tiny final chunks
            if len(self.content) - start < self.chunk_size // 4 and start < len(self.content):
                # Extend last chunk
                if self.chunks:
                    last = self.chunks[-1]
                    last["end"] = len(self.content)
                    last["length"] = last["end"] - last["start"]
                    last["content"] = self.content[last["start"]:last["end"]]
                    last["lineEnd"] = len(self.content_lines)
                break

    def _char_to_line(self, char_pos: int) -> int:
        """Convert character position to line number (1-indexed)"""
        if char_pos <= 0:
            return 1
        return self.content[:char_pos].count("\n") + 1

    def _add_buffer(self, content: str, label: Optional[str] = None) -> Dict:
        """Add content to buffer"""
        buffer_entry = {
            "index": len(self.buffers),
            "content": content,
            "label": label,
            "createdAt": datetime.utcnow().isoformat() + "Z"
        }
        self.buffers.append(buffer_entry)
        return {
            "bufferIndex": buffer_entry["index"],
            "bufferCount": len(self.buffers)
        }


def main():
    """Main REPL loop"""
    repl = RlmRepl()

    # Read from stdin, write to stdout
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
        except json.JSONDecodeError as e:
            response = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {
                    "code": ERROR_PARSE,
                    "message": f"Parse error: {e}"
                }
            }
            print(json.dumps(response), flush=True)
            continue

        response = repl.handle_request(request)
        print(json.dumps(response), flush=True)

        # Handle shutdown
        if request.get("method") == "shutdown":
            break


if __name__ == "__main__":
    main()
