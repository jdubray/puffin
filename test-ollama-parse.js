const output = `NAME                    ID            SIZE    MODIFIED
mistral-small:latest    8039dd90c113  14 GB   3 days ago
qwen2.5-coder:14b       9ec8897f747e  9.0 GB  3 days ago
deepseek-r1:14b         c333b7232bdb  9.0 GB  3 days ago
llama3.2:latest         a80c4f17acd5  2.0 GB  3 days ago`

function parseOllamaList(output) {
  const lines = output.split('\n').filter(l => l.trim())
  console.log('Total lines:', lines.length)
  console.log('Lines:', JSON.stringify(lines, null, 2))

  if (lines.length < 2) {
    console.log('< 2 lines, returning empty')
    return []
  }

  return lines.slice(1).map((line, idx) => {
    const name = line.split(/\s+/)[0]
    console.log(`Line ${idx}: "${line}" -> name: "${name}"`)
    if (!name) return null
    return {
      id: `ollama:${name}`,
      name,
      provider: 'ollama'
    }
  }).filter(Boolean)
}

const result = parseOllamaList(output)
console.log('\nParsed models:', JSON.stringify(result, null, 2))
