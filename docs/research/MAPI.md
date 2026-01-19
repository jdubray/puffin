# Markdown API (MAPI) Specification v0.94

**Draft — January 2026**

*A Human, Machine, and Agent Readable API Description Format*

---

## Abstract

Markdown API (MAPI) is an API description format designed for the modern era where APIs must be understood by humans, language models, and traditional tooling alike. MAPI combines the readability of Markdown with the type safety of TypeScript and the semantic clarity of natural language constraints.

Unlike OpenAPI, which optimizes for deterministic code generation, MAPI optimizes for semantic understanding, probabilistic reasoning, and unified transport protocols. The result is API documentation that renders beautifully in any Markdown viewer while remaining fully parseable for code generation, validation, and agent orchestration.

---

## Design Goals

1. **Text-First:** The documentation is the specification. Prose context and intent are as important as schema definitions.
2. **TypeScript-Native:** Data shapes use TypeScript interfaces—the most token-efficient and LLM-familiar schema language.
3. **Unified Transport:** HTTP, WebSockets, SSE, and internal tools coexist in a single format.
4. **Capability-Oriented:** APIs are organized by what they do, not by URL paths.
5. **Agent-Ready:** Optimized for LLM consumption with explicit intent and constraint sections.
6. **Token-Efficient:** Avoid redundant definitions; don't document what LLMs already know.
7. **Progressive Disclosure:** Task-specific reference cards minimize context window usage.

### A Note on Authentication

Readers familiar with OpenAPI may notice that MAPI has no dedicated "Security" or "Authentication" section. This is intentional, not an oversight.

In MAPI, authentication is a **cross-cutting concern** woven throughout the specification rather than siloed into a single section:

- **Metadata** declares *what* authentication is required (`auth`, `auth_flow`, `auth_scopes`)
- **Auth Intention** explains *why* and *when*—the prose context LLMs need to reason about auth
- **Logic Constraints** capture *behavioral rules*—token expiry, scope requirements, error responses

This approach reflects MAPI's Text-First philosophy: authentication requirements are best understood in context, not in isolation. An agent reading a capability should immediately understand its auth requirements alongside its purpose, not cross-reference a separate security section.

For detailed guidance on documenting authentication, see the [Auth Reference Card](MAPI-AUTH.md).

---

## 1. Document Structure

A MAPI document is a valid Markdown file with the extension `.mapi.md`. It consists of three main sections:

| Section | Purpose | Required |
|---------|---------|----------|
| **Metadata** | API-level configuration (version, base URL, auth) | Yes |
| **Global Types** | Shared TypeScript interfaces | No |
| **Capabilities** | Operations, events, and tools | Yes |

### 1.1 File Extension

MAPI files use the `.mapi.md` extension. This allows them to be recognized as both Markdown (for rendering) and as API specifications (for tooling).

```
api.mapi.md              # Single-file API
messages.mapi.md         # Resource-specific file
types/common.mapi.md     # Shared type definitions
```

### 1.2 General Structure

```markdown
# API Title

Brief description of the API and its purpose.

~~~meta
version: 1.0.0
base_url: https://api.example.com/v1
auth: bearer
~~~

## Global Types

```typescript
interface User { ... }
```

## Capability: Create User

~~~meta
id: users.create
transport: HTTP POST /users
~~~

### Intention
...

### Input
```typescript
interface CreateUserRequest { ... }
```
```

---

## 2. Metadata Block

The metadata block appears at the document level and within each capability. It uses the `~~~meta` fenced block syntax for explicit boundaries.

### 2.1 Document-Level Metadata

```yaml
~~~meta
version: 1.0.0
base_url: https://api.example.com/v1
auth: bearer
auth_header: Authorization
content_type: application/json
errors: standard
~~~
```

| Field | Description | Required |
|-------|-------------|----------|
| `version` | API version string (semver recommended) | Yes |
| `base_url` | Base URL for all HTTP operations | Yes |
| `auth` | Authentication type (bearer, api_key, basic, oauth2, none) | Yes |
| `auth_header` | Header name for auth token (default: Authorization) | No |
| `auth_flow` | OAuth2 flow type (authorization_code, client_credentials, implicit, password) | No |
| `auth_scopes` | Default required scopes for OAuth2 | No |
| `auth_docs_url` | URL to authentication documentation or onboarding guide | No |
| `content_type` | Default content type (default: application/json). Use `multipart/form-data` for file uploads or `application/octet-stream` for binary data. | No |
| `errors` | Error convention: standard or custom (default: standard) | No |

### 2.2 Capability-Level Metadata

```yaml
~~~meta
id: messages.create
transport: HTTP POST /v1/messages
auth: required
idempotent: false
~~~
```

| Field | Description | Required |
|-------|-------------|----------|
| `id` | Unique operation identifier (namespace.action) | Yes |
| `transport` | Protocol and path (see Appendix B) | Yes |
| `auth` | required, optional, or none | No |
| `auth_flow` | OAuth2 flow override for this capability | No |
| `auth_scopes` | Scopes required for this capability (overrides document-level) | No |
| `idempotent` | Whether repeated calls are safe | No |
| `deprecated` | true if operation is deprecated | No |

### 2.3 Multipart Uploads and Binary Content

For file uploads, set `content_type` to `multipart/form-data` and describe file fields in Logic Constraints:

```markdown
## Capability: Upload Document

~~~meta
id: documents.upload
transport: HTTP POST /documents
content_type: multipart/form-data
~~~

### Input
```typescript
interface UploadDocumentRequest {
  file: File;           // The document file
  title: string;
  tags?: string[];
}
```

### Logic Constraints
- `file` must be PDF, DOCX, or TXT format
- Maximum file size: 10MB
- `file` field name in multipart body: "document"
```

For binary downloads, specify `application/octet-stream` in the Output section:

```markdown
## Capability: Download File

~~~meta
id: files.download
transport: HTTP GET /files/{file_id}/content
~~~

### Output
Returns the raw file bytes with appropriate `Content-Type` header.
Response content type: `application/octet-stream` (or original file MIME type)

### Logic Constraints
- `Content-Disposition` header contains the original filename
- Large files may use chunked transfer encoding
```

---

## 3. Global Types

The Global Types section defines reusable TypeScript interfaces that are referenced throughout the specification. This reduces repetition and establishes a consistent vocabulary.

### 3.1 Syntax

Global types are defined in a typescript fenced code block under the "Global Types" heading:

```typescript
## Global Types

// Primitive type aliases
type UUID = string;      // format: uuid-v4
type ISO8601 = string;   // format: ISO 8601 datetime

// Shared interfaces
interface User {
  id: UUID;
  email: string;
  name: string;
  created_at: ISO8601;
}
```

### 3.2 Referencing Global Types

Once defined, global types can be referenced by name in any capability:

```typescript
### Output

interface GetUserResponse {
  user: User;  // References global User type
}
```

---

## 4. Capabilities

The Capability is the core unit of MAPI. A capability represents something the API can do—not an HTTP endpoint, but a logical action with clear intent and constraints.

### 4.1 Structure

Each capability has the following structure:

| Section | Purpose | Required |
|---------|---------|----------|
| `## Capability: Name` | Human-readable capability name | Yes |
| `~~~meta` block | Machine-readable metadata | Yes |
| `### Intention` | Why and when to use this capability | Yes |
| `### Auth Intention` | Authentication context for agents | When auth ≠ none |
| `### Logic Constraints` | Business rules in natural language | No |
| `### Input` | Request schema (TypeScript) | Depends |
| `### Output` | Success response schema | Yes |
| `### Errors` | Non-standard errors only | No |
| `### Example` | Request/response examples | No |

### 4.2 The Intention Section

The Intention section is critical for agent comprehension. It explains:

- What the capability does (in plain language)
- When an agent should choose this capability
- What prerequisites or context are needed

```markdown
### Intention

Creates a new message in a conversation with Claude. Use this capability
when you need to send user input and receive an AI response. The model
processes the full conversation history, so include all relevant context
in the messages array.

This is the primary endpoint for all Claude interactions.
```

### 4.3 Logic Constraints Section

Business rules that cannot be expressed in TypeScript belong here. Use this for behavioral rules, cross-field dependencies, and conditional logic:

```markdown
### Logic Constraints

- `max_tokens` must not exceed the model's context window
- If `stream: true`, response arrives as Server-Sent Events
- When `tool_choice` is specified, `tools` array must not be empty
- The total token count of `messages` + `max_tokens` must fit within model limits
```

**Authentication-related constraints** also belong here when they affect runtime behavior:

```markdown
### Logic Constraints

- Requests without valid Bearer token return 401 Unauthorized
- Expired tokens return 401 with `error: token_expired` in response body
- Insufficient scopes return 403 with `required_scopes` array in response
- Rate limits vary by token tier: 100/min (standard), 1000/min (premium)
- Service account tokens cannot access user-specific resources
```

> **Tip:** Logic Constraints are for rules that affect runtime behavior. TypeScript handles structural validation; Logic Constraints handle semantic validation.

### 4.4 The Auth Intention Section

When a capability requires authentication, the Auth Intention section provides the prose context that agents need to understand *how* to authenticate—not just *that* they must authenticate.

The Auth Intention section explains:

- How to obtain credentials (the onboarding path)
- Which scopes or permissions are required
- Any capability-specific auth considerations
- Alternatives for different integration patterns (user vs. machine-to-machine)

```markdown
### Auth Intention

Requires OAuth2 with `payments:write` scope. Users obtain tokens through
the standard authorization code flow at `/oauth/authorize`.

For server-to-server integrations, use client_credentials flow instead—
register a service account in the Dashboard under Settings > API Access.

Tokens expire after 1 hour. For long-running processes, implement token
refresh or request offline_access scope for refresh tokens.
```

Unlike metadata fields which are machine-parseable, Auth Intention provides the contextual understanding an LLM needs to guide users through authentication or to reason about whether cached credentials are still valid.

> **When to include:** Add Auth Intention whenever `auth: required` and the authentication has nuance beyond "include a Bearer token." Skip it for simple API key authentication where no explanation is needed.

---

## 5. Schemas and Constraints

MAPI uses TypeScript interfaces for schema definitions. TypeScript was chosen for its familiarity to developers and LLMs, its expressiveness, and its token efficiency compared to JSON Schema.

### 5.1 TypeScript Conventions

Use standard TypeScript syntax with these conventions:

```typescript
interface CreateMessageRequest {
  model: "claude-sonnet-4-20250514" | "claude-opus-4-20250514";
  messages: Message[];
  max_tokens: number;        // 1-200000
  temperature?: number;      // 0.0-1.0, default 1.0
  stream?: boolean;          // default false
  metadata?: Record<string, string>;
}
```

### 5.2 Comment-Based Constraints

Use inline comments for constraints that affect a single field:

| Constraint | Applies To | Comment Syntax |
|------------|------------|----------------|
| Range | number | `// 1-100` |
| Min/Max length | string | `// 1-1000 chars` |
| Pattern | string | `// format: email` |
| Default | any | `// default: value` |
| Array bounds | array | `// 1-10 items` |
| Unique | array | `// unique` |

---

## 6. Error Handling

MAPI assumes standard HTTP error semantics by default. Only document errors that have capability-specific meaning.

### 6.1 Standard Errors Convention

When `errors: standard` is specified in metadata, standard HTTP status codes (400, 401, 403, 404, 409, 422, 429, 500, 503) are understood without explicit documentation.

### 6.2 Custom Errors

Document only errors with specific semantics:

```markdown
### Errors

- `overloaded` (529): API is temporarily overloaded. Retry with exponential backoff.
- `context_length_exceeded` (400): Combined input exceeds model's context window.
```

---

## 7. Streaming and Events

MAPI has first-class support for Server-Sent Events (SSE) streaming responses.

### 7.1 SSE Transport

Indicate streaming with the `(SSE)` transport modifier:

```yaml
~~~meta
id: messages.create_stream
transport: HTTP POST /v1/messages (SSE)
~~~
```

### 7.2 Event Types

Define SSE event types using a discriminated union:

```typescript
type StreamEvent =
  | { type: "message_start"; message: Message }
  | { type: "content_block_delta"; delta: TextDelta }
  | { type: "message_stop" };
```

---

## 8. WebSocket Channels

WebSocket APIs use the `WS` transport and define bidirectional message types.

```markdown
## Channel: Realtime Updates

~~~meta
id: realtime.connect
transport: WS /ws/realtime
~~~

### Intention
Establishes a persistent connection for real-time updates.

### Client Messages
```typescript
type ClientMessage =
  | { type: "subscribe"; channel: string }
  | { type: "unsubscribe"; channel: string };
```

### Server Messages
```typescript
type ServerMessage =
  | { type: "update"; data: any }
  | { type: "error"; message: string };
```
```

---

## 9. Webhooks

Webhooks describe outbound HTTP calls that the API makes to client-provided URLs when events occur. Use the `WEBHOOK` transport to document these callback patterns.

### 9.1 Webhook Structure

Webhooks use a similar structure to capabilities but describe what the API sends rather than what it receives:

```markdown
## Webhook: Payment Completed

~~~meta
id: webhooks.payment_completed
transport: WEBHOOK POST {callback_url}
~~~

### Intention
Sent to your registered endpoint when a payment succeeds. Register webhook
URLs through the Dashboard or the webhooks.register capability.

### Output
```typescript
interface PaymentWebhookPayload {
  event: "payment.completed";
  payload: {
    payment_id: string;
    amount: number;
    currency: string;
    customer_id: string;
  };
  timestamp: ISO8601;
  signature: string;  // HMAC-SHA256 for verification
}
```

### Logic Constraints
- Webhook requests include `X-Signature` header for payload verification
- Signature is HMAC-SHA256 of the raw request body using your webhook secret
- Requests timeout after 30 seconds; implement async processing for long tasks
- Failed deliveries retry with exponential backoff (1min, 5min, 30min, 2hr)
```

### 9.2 Webhook Registration

Document the capability for registering webhook endpoints:

```markdown
## Capability: Register Webhook

~~~meta
id: webhooks.register
transport: HTTP POST /webhooks
~~~

### Input
```typescript
interface RegisterWebhookRequest {
  url: string;         // HTTPS endpoint to receive events
  events: string[];     // Event types to subscribe to
  secret?: string;      // Optional; generated if not provided
}
```
```

---

## 10. Internal Tools

MAPI can describe client-side or internal operations using the `INTERNAL` transport:

```markdown
## Tool: Calculate

~~~meta
id: tools.calculate
transport: INTERNAL
~~~

### Intention
Performs mathematical calculations. Use for any arithmetic the agent cannot reliably perform mentally.
```

---

## 11. Collections and File Organization

Large APIs can be split across multiple files using a collection manifest.

### 11.1 Collection Manifest

```yaml
~~~collection
name: Anthropic API
version: 2024-01
files:
  - messages.mapi.md
  - models.mapi.md
  - admin/users.mapi.md
shared_types: types/common.mapi.md
~~~
```

---

## 12. Conversion from OpenAPI/AsyncAPI

MAPI documents can be generated from existing OpenAPI or AsyncAPI specifications.

### 12.1 OpenAPI Mapping

| OpenAPI | MAPI |
|---------|------|
| Operation (path + method) | Capability |
| operationId | Capability id |
| summary + description | Intention |
| requestBody schema | Input interface |
| response schema | Output interface |
| components/schemas | Global Types |

---

## 13. Progressive Disclosure

MAPI supports "reference cards"—focused, task-specific subsets of the full specification designed to minimize token usage when working with LLMs.

### 13.1 Reference Card Types

- **Author Card:** For LLMs writing MAPI specs
- **Consumer Card:** For LLMs calling APIs
- **Conversion Card:** For converting between formats
- **Validation Card:** For validating MAPI documents

### 13.2 Disclosure Document

A disclosure document helps agents determine which reference card to load:

```yaml
~~~disclosure
cards:
  author:
    description: Write a new MAPI specification
    file: MAPI-AUTHOR.md
  consumer:
    description: Call an API described in MAPI format
    file: MAPI-CONSUMER.md
~~~
```

---

## 14. Complete Examples

See the `/examples` directory for complete MAPI specifications including:

- Simple REST API (task management)
- Streaming API (chat completion)
- WebSocket API (real-time collaboration)
- Mixed transport API (HTTP + WebSocket)

---

## Appendix A: Constraint Reference

| Constraint | Applies To | Syntax |
|------------|------------|--------|
| Range | number | `// 1-100` |
| Min only | number | `// min: 0` |
| Max only | number | `// max: 1000` |
| String length | string | `// 1-1000 chars` |
| Format | string | `// format: email` |
| Pattern | string | `// pattern: ^[a-z]+$` |
| Default | any | `// default: value` |
| Array bounds | array | `// 1-10 items` |
| Unique items | array | `// unique` |

---

## Appendix B: Transport Strings

| Transport | Format | Example |
|-----------|--------|---------|
| HTTP (standard) | `HTTP METHOD /path` | `HTTP POST /users` |
| HTTP with path params | `HTTP METHOD /path/{param}` | `HTTP GET /users/{id}` |
| HTTP with SSE | `HTTP METHOD /path (SSE)` | `HTTP POST /messages (SSE)` |
| WebSocket | `WS /path` | `WS /ws/realtime` |
| Webhook (outbound) | `WEBHOOK METHOD {callback_url}` | `WEBHOOK POST {callback_url}` |
| Internal/Client-side | `INTERNAL` | `INTERNAL` |

---

## Appendix C: Standard Errors

When `errors: standard` is specified, these HTTP status codes follow conventional semantics:

| Status | Type | When |
|--------|------|------|
| `400` | Bad Request | Malformed JSON, invalid field values |
| `401` | Unauthorized | Missing or invalid credentials |
| `403` | Forbidden | Insufficient permissions |
| `404` | Not Found | Resource does not exist |
| `409` | Conflict | Resource state conflict |
| `422` | Unprocessable | Semantically invalid |
| `429` | Rate Limited | Too many requests |
| `500` | Server Error | Unexpected internal error |
| `503` | Unavailable | Service temporarily unavailable |

LLMs and developers understand these without explicit documentation. Only document errors with capability-specific semantics.

---

*— End of Specification —*