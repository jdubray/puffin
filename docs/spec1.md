# SSH Remote LLM Plugin - Specification & Design Document

## PART 1: SPECIFICATION

### 1.1 Feature Overview

**Title:** SSH Remote LLM Plugin

**Description:** A plugin that enables Puffin to communicate with and control LLM models running on remote servers via SSH. This allows users to leverage remote compute resources, alternative models, or isolated environments for code generation and analysis tasks.

**Purpose:**
- Support heterogeneous LLM backends (non-Claude models)
- Enable remote execution on specialized hardware (GPUs, TPUs)
- Provide isolated environments for sensitive projects
- Support on-premises or air-gapped LLM deployments

### 1.2 User Stories

#### Story 1: Configure Remote LLM Server
**Title:** Configure SSH connection to remote LLM server

**Description:** As a user, I want to configure an SSH connection to a remote server running an LLM, so that Puffin can communicate with it.

**Acceptance Criteria:**
- User can add a new SSH remote configuration with hostname, port, username
- User can choose authentication method (password, SSH key, SSH agent)
- SSH key path can be specified for private key authentication
- Configuration is persisted in .puffin/config/ directory
- User can test the SSH connection before saving
- Connection status is displayed in the UI

#### Story 2: Select Remote LLM Model
**Title:** Discover and select available LLM models on remote server

**Description:** As a user, I want to see available LLM models on the remote server and select one for use, so that I can choose the appropriate model for my task.

**Acceptance Criteria:**
- Plugin discovers available models via remote API endpoint
- Model list is displayed with name, description, and parameters
- User can select a default remote model
- Selected model is persisted and restored on restart
- Model info includes context window, input/output token limits

#### Story 3: Submit Prompts to Remote LLM
**Title:** Send prompts to remote LLM and receive responses

**Description:** As a user, I want to submit prompts to the remote LLM through Puffin, so that I can use it for code generation and analysis.

**Acceptance Criteria:**
- Prompts can be sent with system message and user content
- Tool use requests are passed through to remote LLM
- Streaming responses are supported
- Response is captured and displayed in Puffin UI
- Error handling for network timeouts and connection failures
- Token usage is tracked (if remote API provides it)

#### Story 4: Tool Integration
**Title:** Bridge Puffin tools with remote LLM

**Description:** As a user, I want tool use requests from the remote LLM to be handled by Puffin's local tools, so that the remote model can access filesystem, git, and other capabilities.

**Acceptance Criteria:**
- Tool use results are sent back to remote LLM for continuation
- Tool execution results are tracked in conversation history
- Local tools (Read, Write, Bash, etc.) execute on user's machine
- Remote LLM can make sequential tool calls within same conversation

### 1.3 Constraints & Requirements

**Functional Requirements:**
- Support SSH protocol with standard authentication methods
- Compatible with LLM APIs that follow OpenAI-like interface (or configurable endpoint)
- Support streaming and non-streaming responses
- Handle multi-turn conversations with tool use
- Automatic reconnection on SSH disconnection

**Non-Functional Requirements:**
- Connection pooling to minimize SSH overhead
- Timeout handling (default 30s per request, configurable)
- Graceful degradation if remote server is unavailable
- Encrypted storage of SSH credentials
- Connection logging and debugging capabilities

**Scope Inclusions:**
- SSH transport layer
- Configuration UI and persistence
- Model discovery and selection
- Request/response streaming
- Tool use bridging
- Error handling and user feedback

**Scope Exclusions:**
- Custom LLM deployment tools
- SSH key generation utilities
- VPN or network configuration
- Remote model fine-tuning or training
- Cost tracking across multiple remote models

### 1.4 Integration Points

1. **IPC Channels:** New `remote-llm:*` channel family
   - `remote-llm:configure` - Save/update SSH configuration
   - `remote-llm:test-connection` - Validate SSH connectivity
   - `remote-llm:list-models` - Discover available models
   - `remote-llm:submit-prompt` - Send prompt to remote LLM

2. **UI Components:** New settings page or panel for remote configuration

3. **Claude Service Extension:** New method alongside `submit()` for remote submission

4. **State Management:** New saga/acceptor for remote LLM state

5. **Error Handling:** SSH-specific error types and messages

---

## PART 2: DETAILED DESIGN DOCUMENT

### 2.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Puffin Renderer                      │
│  ┌────────────────────────────────────────────────────┐  │
│  │         Remote LLM Settings Component              │  │
│  │  - SSH Configuration Form                          │  │
│  │  - Model Selection Dropdown                        │  │
│  │  - Connection Status Indicator                     │  │
│  └────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
                          ↕ IPC
┌─────────────────────────────────────────────────────────┐
│                 Puffin Main Process                      │
│  ┌────────────────────────────────────────────────────┐  │
│  │           Remote LLM Manager Module                │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  SSH Connection Pool                         │  │  │
│  │  │  - Multiplexed SSH channels                  │  │  │
│  │  │  - Reconnection logic                        │  │  │
│  │  │  - Credential management                     │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  Remote LLM Protocol Handler                 │  │  │
│  │  │  - HTTP/JSON over SSH tunnel                 │  │  │
│  │  │  - OpenAI-compatible endpoint                │  │  │
│  │  │  - Streaming response handling               │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  Tool Result Bridge                          │  │  │
│  │  │  - Execute local tools on tool requests      │  │  │
│  │  │  - Send results back to remote LLM           │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │  SAM Model Extensions                              │  │
│  │  - remoteConfigs state                             │  │
│  │  - activeRemoteConnection state                    │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↕ SSH
┌─────────────────────────────────────────────────────────┐
│              Remote Server                              │
│  ┌────────────────────────────────────────────────────┐  │
│  │  LLM API Server (ollama, vLLM, llama.cpp, etc.)    │  │
│  │  http://localhost:8000/v1/chat/completions        │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Core Modules

#### Module 1: SSH Connection Pool (`src/main/remote-llm/ssh-pool.js`)

**Purpose:** Manage persistent SSH connections and multiplexing

**Key Classes:**
```javascript
class SSHConnectionPool {
  constructor(options) {
    this.pools = new Map()  // Map<configId, SSHClient>
    this.channels = new Map()  // Map<configId, ChannelPool>
    this.reconnectIntervals = new Map()
  }
  
  async getConnection(configId, sshConfig) {}
  async executeRemoteCommand(configId, command) {}
  async closeConnection(configId) {}
  async testConnection(sshConfig) {}
}
```

**Responsibilities:**
- Create/reuse SSH connections per configuration
- Handle SSH authentication (password, key, agent)
- Implement automatic reconnection with exponential backoff
- Manage channel multiplexing for concurrent requests
- Store encrypted credentials in electron-store

**Key Methods:**
- `getConnection(configId, sshConfig)` - Get or create SSH client
- `testConnection(sshConfig)` - Validate connectivity without storing
- `closeConnection(configId)` - Clean disconnect
- `isConnected(configId)` - Check connection status

#### Module 2: Remote LLM Protocol Handler (`src/main/remote-llm/protocol-handler.js`)

**Purpose:** Handle HTTP communication with remote LLM API

**Key Classes:**
```javascript
class RemoteLLMProtocolHandler {
  constructor(sshPool, config) {
    this.sshPool = sshPool
    this.config = config  // SSH config + API endpoint info
    this.httpClient = null
  }
  
  async listModels() {}
  async sendPrompt(prompt, options) {}
  async streamPrompt(prompt, options, onChunk) {}
}
```

**Responsibilities:**
- Establish HTTP tunnel over SSH
- Implement OpenAI-compatible API client
- Handle streaming and non-streaming responses
- Manage request timeouts and retries
- Parse token usage from API responses

**Key Methods:**
- `listModels()` - GET /v1/models (or /models)
- `sendPrompt(messages, model, tools)` - POST /v1/chat/completions
- `streamPrompt(messages, model, onChunk)` - Streaming completions

#### Module 3: Tool Result Bridge (`src/main/remote-llm/tool-bridge.js`)

**Purpose:** Execute local tools and return results to remote LLM

**Key Classes:**
```javascript
class ToolResultBridge {
  constructor(toolRegistry) {
    this.tools = toolRegistry  // Access to all local tools
    this.conversationHistory = []
  }
  
  async executeToolCall(toolUse) {}
  async continueConversation(toolResults, previousMessages) {}
}
```

**Responsibilities:**
- Intercept tool use requests from remote LLM
- Execute tools locally using existing tool registry
- Format tool results for remote LLM consumption
- Maintain conversation context across tool calls
- Handle tool execution errors gracefully

**Key Methods:**
- `executeToolCall(toolName, toolInput)` - Run local tool
- `continueWithToolResults(messages, toolResults)` - Resume conversation

#### Module 4: Configuration Manager (`src/main/remote-llm/config-manager.js`)

**Purpose:** Persist and validate SSH and LLM configurations

**Key Classes:**
```javascript
class RemoteLLMConfigManager {
  constructor(storageDir) {
    this.storageDir = path.join(storageDir, '.puffin', 'remote-configs')
    this.store = new Store({ name: 'remote-llm-config' })
  }
  
  async saveConfig(configId, sshConfig, llmConfig) {}
  async getConfig(configId) {}
  async listConfigs() {}
  async deleteConfig(configId) {}
}
```

**Responsibilities:**
- CRUD operations for SSH configurations
- Encrypt and decrypt SSH credentials
- Validate configuration before saving
- Provide default configurations for common setups (ollama, vLLM)

**Configuration Schema:**
```json
{
  "id": "remote-1",
  "name": "Production GPU Server",
  "ssh": {
    "host": "gpu.example.com",
    "port": 22,
    "username": "ai-user",
    "authMethod": "privateKey",
    "privateKeyPath": "~/.ssh/id_rsa",
    "passphrase": null,
    "connectTimeout": 30000
  },
  "llm": {
    "apiEndpoint": "http://localhost:8000",
    "apiType": "openai-compatible",
    "defaultModel": "mistral-7b",
    "requestTimeout": 30000,
    "maxRetries": 3
  }
}
```

### 2.3 IPC Handler Implementation

**File:** `src/main/ipc-handlers/remote-llm-handlers.js`

**Handlers:**

```javascript
// Configure SSH connection
ipcMain.handle('remote-llm:configure', async (event, { configId, sshConfig, llmConfig }) => {
  const result = await configManager.saveConfig(configId, sshConfig, llmConfig)
  // Dispatch SAM action to update model
  await model.dispatch({ type: 'REMOTE_CONFIG_SAVED', payload: result })
  return result
})

// Test SSH connectivity
ipcMain.handle('remote-llm:test-connection', async (event, sshConfig) => {
  try {
    await sshPool.testConnection(sshConfig)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// List models on remote server
ipcMain.handle('remote-llm:list-models', async (event, configId) => {
  const config = await configManager.getConfig(configId)
  const handler = new RemoteLLMProtocolHandler(sshPool, config)
  const models = await handler.listModels()
  return models
})

// Submit prompt to remote LLM
ipcMain.handle('remote-llm:submit-prompt', async (event, { configId, messages, model, tools }) => {
  const config = await configManager.getConfig(configId)
  const handler = new RemoteLLMProtocolHandler(sshPool, config)
  
  let result = await handler.sendPrompt({ messages, model, tools })
  
  // Handle tool use loop
  while (result.content && result.content[0]?.type === 'tool_use') {
    const toolUse = result.content[0]
    const toolResult = await toolBridge.executeToolCall(toolUse)
    
    // Send back to remote LLM
    messages.push({ role: 'assistant', content: [toolUse] })
    messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: toolResult }] })
    
    result = await handler.sendPrompt({ messages, model, tools })
  }
  
  return result
})

// Stream prompt to remote LLM
ipcMain.handle('remote-llm:stream-prompt', async (event, { configId, messages, model }) => {
  const config = await configManager.getConfig(configId)
  const handler = new RemoteLLMProtocolHandler(sshPool, config)
  
  let buffer = ''
  await handler.streamPrompt({ messages, model }, (chunk) => {
    buffer += chunk
    event.sender.send('remote-llm:stream-chunk', { chunk })
  })
  
  return buffer
})
```

### 2.4 UI Component (`src/renderer/components/remote-llm-settings.js`)

**Purpose:** Settings panel for configuring and managing remote LLM connections

**Structure:**
```javascript
class RemoteLLMSettings {
  constructor(element, options) {
    this.element = element
    this.context = options.context
    this.configs = []
    this.selectedConfigId = null
  }
  
  init() {
    this._renderConfigList()
    this._attachEventListeners()
  }
  
  _renderConfigList() {}
  _showAddConfigForm() {}
  _showEditConfigForm(configId) {}
  _testConnection() {}
  _deleteConfig(configId) {}
  _selectModel(configId, modelId) {}
}
```

**Features:**
- List existing SSH configurations
- Add/edit/delete configurations
- Test connection button with status indicator
- Model discovery and selection
- Display connection status and last sync time

### 2.5 SAM Model Extensions

**New State Properties:**
```javascript
remoteConfigs: [
  { id, name, ssh, llm, status, lastChecked }
]
activeRemoteConnection: {
  configId,
  isConnected,
  selectedModel,
  models: []
}
remoteConversationHistory: [
  { role, content, timestamp }
]
```

**New Actions:**
```javascript
{ type: 'REMOTE_CONFIG_SAVED', payload: { config } }
{ type: 'REMOTE_CONFIG_DELETED', payload: { configId } }
{ type: 'REMOTE_CONNECTION_ESTABLISHED', payload: { configId, models } }
{ type: 'REMOTE_CONNECTION_FAILED', payload: { configId, error } }
{ type: 'REMOTE_MODEL_SELECTED', payload: { configId, modelId } }
{ type: 'REMOTE_CONVERSATION_UPDATED', payload: { messages } }
```

### 2.6 Implementation Phases

**Phase 1: Foundation (Sprint 1)**
- Implement SSH connection pool with basic auth
- Create configuration manager and schema
- Add IPC handlers for configure/test-connection
- Build basic settings UI form

**Phase 2: Model Discovery (Sprint 2)**
- Implement protocol handler for OpenAI-compatible APIs
- Add model listing and discovery
- Extend SAM model with remote configs state
- Build model selection UI

**Phase 3: Prompt Submission (Sprint 3)**
- Implement streaming and non-streaming prompt submission
- Add request/response lifecycle tracking
- Integrate with existing prompting UI
- Handle errors and timeouts

**Phase 4: Tool Integration (Sprint 4)**
- Implement tool result bridge
- Add tool use execution loop
- Handle multi-turn conversations with tools
- Test with various remote LLM servers

### 2.7 Error Handling

**SSH-Specific Errors:**
- `SSH_AUTH_FAILED` - Authentication error (wrong credentials)
- `SSH_CONNECTION_TIMEOUT` - Cannot reach SSH host
- `SSH_CHANNEL_ERROR` - Channel creation failed
- `SSH_DISCONNECTED` - Connection unexpectedly closed

**LLM API Errors:**
- `API_UNAVAILABLE` - Remote API not responding
- `API_INVALID_MODEL` - Requested model doesn't exist
- `API_RATE_LIMITED` - Too many requests
- `API_ERROR` - Generic API error

**Tool Execution Errors:**
- `TOOL_NOT_FOUND` - Requested tool doesn't exist
- `TOOL_EXECUTION_FAILED` - Tool failed to execute
- `TOOL_TIMEOUT` - Tool execution took too long

### 2.8 Security Considerations

1. **Credential Storage:**
   - SSH passwords/passphrases encrypted using electron-store's built-in encryption
   - Private key paths stored (not the keys themselves)
   - SSH agent support to avoid storing keys

2. **Network Security:**
   - SSH tunnel encrypts all communication
   - HTTPS support for remote API (if available)
   - Connection verification before use

3. **Tool Execution:**
   - Tools execute only with user's existing permissions
   - No elevation of privileges
   - Tool input validated before execution

4. **Audit Trail:**
   - Log all remote LLM submissions and responses (debug mode)
   - Track tool executions across remote submissions

### 2.9 Testing Strategy

**Unit Tests:**
- SSH pool connection/reconnection logic
- Configuration validation
- Protocol handler request formatting
- Tool result bridge tool execution

**Integration Tests:**
- End-to-end flow with mock SSH server
- Tool use loop with actual tool execution
- Error handling and recovery scenarios

**Manual Testing:**
- Against real ollama/vLLM instances
- With various SSH authentication methods
- Network failure and recovery scenarios

### 2.10 Dependencies

**New npm packages:**
- `ssh2` - SSH client library
- `ssh2-sftp-client` - SFTP support (optional)
- No additional runtime dependencies for core functionality

**Existing dependencies leveraged:**
- `electron-store` - Configuration encryption
- Existing tool registry for tool execution
- SAM architecture for state management

### 2.11 Acceptance Criteria Summary

- ✓ SSH connections can be created and tested
- ✓ Multiple SSH configurations stored and managed
- ✓ Remote LLM models discovered and displayed
- ✓ Prompts submitted to remote LLM with streaming support
- ✓ Tool use requests executed locally and results sent back
- ✓ Multi-turn conversations with tool use supported
- ✓ Connection pooling minimizes SSH overhead
- ✓ Graceful error handling and user feedback
- ✓ Credentials encrypted at rest
- ✓ Connection status visible in UI