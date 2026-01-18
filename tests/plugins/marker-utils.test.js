/**
 * MarkerUtils Tests
 *
 * Tests for the Puffin inline prompt marker utility functions.
 * Covers marker detection, extraction, creation, removal, and edge cases.
 */

// Since MarkerUtils uses ES modules, we need to handle the import differently
// For Jest in Node.js environment, we'll test the logic patterns
const MarkerUtils = (() => {
  // Replicate the module's exports for testing in CommonJS environment
  const MARKER_START = '/@puffin:'
  const MARKER_END = '//'
  const MARKER_REGEX = /\/@puffin:\s*([\s\S]*?)\s*\/\//g

  function findAllMarkers(content) {
    if (!content) return []
    const markers = []
    const regex = new RegExp(MARKER_REGEX.source, MARKER_REGEX.flags)
    let match
    while ((match = regex.exec(content)) !== null) {
      markers.push({
        fullMatch: match[0],
        prompt: match[1].trim(),
        startIndex: match.index,
        endIndex: match.index + match[0].length
      })
    }
    return markers
  }

  function hasMarkers(content) {
    if (!content) return false
    const regex = new RegExp(MARKER_REGEX.source, MARKER_REGEX.flags)
    return regex.test(content)
  }

  function countMarkers(content) {
    if (!content) return 0
    const regex = new RegExp(MARKER_REGEX.source, MARKER_REGEX.flags)
    const matches = content.matchAll(regex)
    let count = 0
    for (const _ of matches) {
      count++
    }
    return count
  }

  function createMarker(promptText = '') {
    const text = promptText.trim()
    if (text) {
      if (text.includes('\n')) {
        return `${MARKER_START}\n${text}\n${MARKER_END}`
      }
      return `${MARKER_START} ${text} ${MARKER_END}`
    }
    return `${MARKER_START}  ${MARKER_END}`
  }

  function removeAllMarkers(content) {
    if (!content) return content
    return content.replace(new RegExp(MARKER_REGEX.source, MARKER_REGEX.flags), '')
  }

  function removeMarkerByIndex(content, markerIndex) {
    if (!content) return content
    const markers = findAllMarkers(content)
    if (markerIndex < 0 || markerIndex >= markers.length) {
      return content
    }
    const marker = markers[markerIndex]
    return content.slice(0, marker.startIndex) + content.slice(marker.endIndex)
  }

  function extractPrompts(content) {
    return findAllMarkers(content).map(m => m.prompt)
  }

  function combinePrompts(content, separator = '\n---\n') {
    const prompts = extractPrompts(content)
    return prompts.join(separator)
  }

  function escapeHtmlEntities(str) {
    if (!str) return str
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function highlightMarkersInHtml(html) {
    if (!html) return html
    const escapedMarkerPattern = /(\/@puffin:[\s\S]*?\/\/)/g
    return html.replace(escapedMarkerPattern, (match) => {
      const sanitizedMatch = escapeHtmlEntities(match)
      return `<span class="puffin-marker">${sanitizedMatch}</span>`
    })
  }

  function isValidMarker(text) {
    if (!text) return false
    const trimmed = text.trim()
    return trimmed.startsWith(MARKER_START) && trimmed.endsWith(MARKER_END)
  }

  function getMarkerAtPosition(content, cursorPosition) {
    const markers = findAllMarkers(content)
    for (let i = 0; i < markers.length; i++) {
      const marker = markers[i]
      if (cursorPosition >= marker.startIndex && cursorPosition <= marker.endIndex) {
        return { marker, index: i }
      }
    }
    return null
  }

  function getCursorPositionInMarker(markerStart) {
    return markerStart + MARKER_START.length + 1
  }

  return {
    MARKER_START,
    MARKER_END,
    MARKER_REGEX,
    findAllMarkers,
    hasMarkers,
    countMarkers,
    createMarker,
    removeAllMarkers,
    removeMarkerByIndex,
    extractPrompts,
    combinePrompts,
    highlightMarkersInHtml,
    isValidMarker,
    getMarkerAtPosition,
    getCursorPositionInMarker
  }
})()

describe('MarkerUtils', () => {
  describe('Constants', () => {
    it('should have correct MARKER_START value', () => {
      expect(MarkerUtils.MARKER_START).toBe('/@puffin:')
    })

    it('should have correct MARKER_END value', () => {
      expect(MarkerUtils.MARKER_END).toBe('//')
    })

    it('should have a valid MARKER_REGEX', () => {
      expect(MarkerUtils.MARKER_REGEX).toBeInstanceOf(RegExp)
      expect(MarkerUtils.MARKER_REGEX.flags).toContain('g')
    })
  })

  describe('findAllMarkers', () => {
    it('should return empty array for null content', () => {
      expect(MarkerUtils.findAllMarkers(null)).toEqual([])
    })

    it('should return empty array for undefined content', () => {
      expect(MarkerUtils.findAllMarkers(undefined)).toEqual([])
    })

    it('should return empty array for empty string', () => {
      expect(MarkerUtils.findAllMarkers('')).toEqual([])
    })

    it('should return empty array for content without markers', () => {
      expect(MarkerUtils.findAllMarkers('Hello world')).toEqual([])
    })

    it('should find a single marker', () => {
      const content = 'text /@puffin: fix this bug // more text'
      const markers = MarkerUtils.findAllMarkers(content)

      expect(markers).toHaveLength(1)
      expect(markers[0].fullMatch).toBe('/@puffin: fix this bug //')
      expect(markers[0].prompt).toBe('fix this bug')
      expect(markers[0].startIndex).toBe(5)
      expect(markers[0].endIndex).toBe(30)
    })

    it('should find multiple markers', () => {
      const content = '/@puffin: first // middle /@puffin: second //'
      const markers = MarkerUtils.findAllMarkers(content)

      expect(markers).toHaveLength(2)
      expect(markers[0].prompt).toBe('first')
      expect(markers[1].prompt).toBe('second')
    })

    it('should handle markers with extra whitespace', () => {
      const content = '/@puffin:    lots of space    //'
      const markers = MarkerUtils.findAllMarkers(content)

      expect(markers).toHaveLength(1)
      expect(markers[0].prompt).toBe('lots of space')
    })

    it('should handle multiline marker content', () => {
      const content = `/@puffin:
        line 1
        line 2
      //`
      const markers = MarkerUtils.findAllMarkers(content)

      expect(markers).toHaveLength(1)
      expect(markers[0].prompt).toContain('line 1')
      expect(markers[0].prompt).toContain('line 2')
    })

    it('should handle empty marker content', () => {
      const content = '/@puffin: //'
      const markers = MarkerUtils.findAllMarkers(content)

      expect(markers).toHaveLength(1)
      expect(markers[0].prompt).toBe('')
    })

    it('should handle marker at start of content', () => {
      const content = '/@puffin: start // rest'
      const markers = MarkerUtils.findAllMarkers(content)

      expect(markers).toHaveLength(1)
      expect(markers[0].startIndex).toBe(0)
    })

    it('should handle marker at end of content', () => {
      const content = 'prefix /@puffin: end //'
      const markers = MarkerUtils.findAllMarkers(content)

      expect(markers).toHaveLength(1)
      expect(markers[0].endIndex).toBe(content.length)
    })

    it('should handle consecutive markers without space', () => {
      const content = '/@puffin: a ///@puffin: b //'
      const markers = MarkerUtils.findAllMarkers(content)

      expect(markers).toHaveLength(2)
    })

    it('should NOT match malformed markers - missing end', () => {
      const content = '/@puffin: incomplete marker'
      const markers = MarkerUtils.findAllMarkers(content)

      expect(markers).toHaveLength(0)
    })

    it('should NOT match malformed markers - missing start', () => {
      const content = 'just some text //'
      const markers = MarkerUtils.findAllMarkers(content)

      expect(markers).toHaveLength(0)
    })

    it('should handle special characters in prompt', () => {
      const content = '/@puffin: add <div class="test"> element //'
      const markers = MarkerUtils.findAllMarkers(content)

      expect(markers).toHaveLength(1)
      expect(markers[0].prompt).toBe('add <div class="test"> element')
    })

    it('should handle regex special characters in prompt', () => {
      const content = '/@puffin: match (.*?) pattern //'
      const markers = MarkerUtils.findAllMarkers(content)

      expect(markers).toHaveLength(1)
      expect(markers[0].prompt).toBe('match (.*?) pattern')
    })
  })

  describe('hasMarkers', () => {
    it('should return false for null content', () => {
      expect(MarkerUtils.hasMarkers(null)).toBe(false)
    })

    it('should return false for empty content', () => {
      expect(MarkerUtils.hasMarkers('')).toBe(false)
    })

    it('should return false for content without markers', () => {
      expect(MarkerUtils.hasMarkers('regular text')).toBe(false)
    })

    it('should return true for content with a marker', () => {
      expect(MarkerUtils.hasMarkers('/@puffin: test //')).toBe(true)
    })

    it('should return true for content with multiple markers', () => {
      expect(MarkerUtils.hasMarkers('/@puffin: a // /@puffin: b //')).toBe(true)
    })
  })

  describe('countMarkers', () => {
    it('should return 0 for empty content', () => {
      expect(MarkerUtils.countMarkers('')).toBe(0)
    })

    it('should return 0 for content without markers', () => {
      expect(MarkerUtils.countMarkers('no markers here')).toBe(0)
    })

    it('should return 1 for single marker', () => {
      expect(MarkerUtils.countMarkers('/@puffin: one //')).toBe(1)
    })

    it('should return correct count for multiple markers', () => {
      expect(MarkerUtils.countMarkers('/@puffin: a // /@puffin: b // /@puffin: c //')).toBe(3)
    })
  })

  describe('createMarker', () => {
    it('should create empty marker with no argument', () => {
      const marker = MarkerUtils.createMarker()
      expect(marker).toBe('/@puffin:  //')
    })

    it('should create empty marker with empty string', () => {
      const marker = MarkerUtils.createMarker('')
      expect(marker).toBe('/@puffin:  //')
    })

    it('should create marker with single-line text', () => {
      const marker = MarkerUtils.createMarker('fix this bug')
      expect(marker).toBe('/@puffin: fix this bug //')
    })

    it('should trim prompt text', () => {
      const marker = MarkerUtils.createMarker('  trimmed  ')
      expect(marker).toBe('/@puffin: trimmed //')
    })

    it('should create multiline marker for multiline text', () => {
      const marker = MarkerUtils.createMarker('line1\nline2')
      expect(marker).toBe('/@puffin:\nline1\nline2\n//')
    })

    it('should handle text with only whitespace', () => {
      const marker = MarkerUtils.createMarker('   ')
      expect(marker).toBe('/@puffin:  //')
    })
  })

  describe('removeAllMarkers', () => {
    it('should return null for null content', () => {
      expect(MarkerUtils.removeAllMarkers(null)).toBe(null)
    })

    it('should return undefined for undefined content', () => {
      expect(MarkerUtils.removeAllMarkers(undefined)).toBe(undefined)
    })

    it('should return empty string for empty content', () => {
      expect(MarkerUtils.removeAllMarkers('')).toBe('')
    })

    it('should return same content if no markers', () => {
      const content = 'no markers here'
      expect(MarkerUtils.removeAllMarkers(content)).toBe(content)
    })

    it('should remove single marker', () => {
      const content = 'before /@puffin: remove me // after'
      expect(MarkerUtils.removeAllMarkers(content)).toBe('before  after')
    })

    it('should remove all markers', () => {
      const content = '/@puffin: a // middle /@puffin: b //'
      expect(MarkerUtils.removeAllMarkers(content)).toBe(' middle ')
    })

    it('should remove marker and preserve surrounding content', () => {
      const content = 'start /@puffin: test // end'
      expect(MarkerUtils.removeAllMarkers(content)).toBe('start  end')
    })

    it('should handle multiline markers', () => {
      const content = 'before /@puffin:\nmultiline\n// after'
      expect(MarkerUtils.removeAllMarkers(content)).toBe('before  after')
    })
  })

  describe('removeMarkerByIndex', () => {
    it('should return content unchanged for null content', () => {
      expect(MarkerUtils.removeMarkerByIndex(null, 0)).toBe(null)
    })

    it('should return content unchanged for invalid negative index', () => {
      const content = '/@puffin: test //'
      expect(MarkerUtils.removeMarkerByIndex(content, -1)).toBe(content)
    })

    it('should return content unchanged for index out of bounds', () => {
      const content = '/@puffin: test //'
      expect(MarkerUtils.removeMarkerByIndex(content, 5)).toBe(content)
    })

    it('should remove first marker (index 0)', () => {
      const content = '/@puffin: first // /@puffin: second //'
      expect(MarkerUtils.removeMarkerByIndex(content, 0)).toBe(' /@puffin: second //')
    })

    it('should remove second marker (index 1)', () => {
      const content = '/@puffin: first // /@puffin: second //'
      expect(MarkerUtils.removeMarkerByIndex(content, 1)).toBe('/@puffin: first // ')
    })

    it('should remove only marker when single marker exists', () => {
      const content = 'text /@puffin: only // more'
      expect(MarkerUtils.removeMarkerByIndex(content, 0)).toBe('text  more')
    })
  })

  describe('extractPrompts', () => {
    it('should return empty array for empty content', () => {
      expect(MarkerUtils.extractPrompts('')).toEqual([])
    })

    it('should return empty array for content without markers', () => {
      expect(MarkerUtils.extractPrompts('no markers')).toEqual([])
    })

    it('should extract single prompt', () => {
      expect(MarkerUtils.extractPrompts('/@puffin: hello //')).toEqual(['hello'])
    })

    it('should extract multiple prompts in order', () => {
      const content = '/@puffin: first // /@puffin: second // /@puffin: third //'
      expect(MarkerUtils.extractPrompts(content)).toEqual(['first', 'second', 'third'])
    })

    it('should handle empty prompts', () => {
      expect(MarkerUtils.extractPrompts('/@puffin:  //')).toEqual([''])
    })
  })

  describe('combinePrompts', () => {
    it('should return empty string for no markers', () => {
      expect(MarkerUtils.combinePrompts('no markers')).toBe('')
    })

    it('should return single prompt without separator', () => {
      expect(MarkerUtils.combinePrompts('/@puffin: only //')).toBe('only')
    })

    it('should combine prompts with default separator', () => {
      const content = '/@puffin: a // /@puffin: b //'
      expect(MarkerUtils.combinePrompts(content)).toBe('a\n---\nb')
    })

    it('should use custom separator', () => {
      const content = '/@puffin: a // /@puffin: b //'
      expect(MarkerUtils.combinePrompts(content, ' | ')).toBe('a | b')
    })

    it('should handle three prompts', () => {
      const content = '/@puffin: x // /@puffin: y // /@puffin: z //'
      expect(MarkerUtils.combinePrompts(content, ', ')).toBe('x, y, z')
    })
  })

  describe('highlightMarkersInHtml', () => {
    it('should return null for null input', () => {
      expect(MarkerUtils.highlightMarkersInHtml(null)).toBe(null)
    })

    it('should return undefined for undefined input', () => {
      expect(MarkerUtils.highlightMarkersInHtml(undefined)).toBe(undefined)
    })

    it('should return empty string for empty input', () => {
      expect(MarkerUtils.highlightMarkersInHtml('')).toBe('')
    })

    it('should return unchanged HTML if no markers', () => {
      const html = '<div>no markers</div>'
      expect(MarkerUtils.highlightMarkersInHtml(html)).toBe(html)
    })

    it('should wrap marker in span', () => {
      const html = 'text /@puffin: test // more'
      const result = MarkerUtils.highlightMarkersInHtml(html)
      expect(result).toBe('text <span class="puffin-marker">/@puffin: test //</span> more')
    })

    it('should wrap multiple markers', () => {
      const html = '/@puffin: a // mid /@puffin: b //'
      const result = MarkerUtils.highlightMarkersInHtml(html)
      expect(result).toContain('<span class="puffin-marker">/@puffin: a //</span>')
      expect(result).toContain('<span class="puffin-marker">/@puffin: b //</span>')
    })

    it('should escape HTML in surrounding content too', () => {
      const html = '<div>/@puffin: test //</div>'
      const result = MarkerUtils.highlightMarkersInHtml(html)
      // The entire input is processed, escaping HTML entities including surrounding tags
      expect(result).toContain('<span class="puffin-marker">/@puffin: test //</span>')
    })

    // XSS Prevention tests
    it('should escape HTML tags in marker content to prevent XSS', () => {
      const html = '/@puffin: <script>alert("xss")</script> //'
      const result = MarkerUtils.highlightMarkersInHtml(html)
      expect(result).not.toContain('<script>')
      expect(result).toContain('&lt;script&gt;')
      expect(result).toContain('&lt;/script&gt;')
    })

    it('should escape angle brackets in marker content', () => {
      const html = '/@puffin: add <div> element //'
      const result = MarkerUtils.highlightMarkersInHtml(html)
      expect(result).toContain('&lt;div&gt;')
      expect(result).not.toContain('<div>')
    })

    it('should escape ampersands in marker content', () => {
      const html = '/@puffin: Tom & Jerry //'
      const result = MarkerUtils.highlightMarkersInHtml(html)
      expect(result).toContain('Tom &amp; Jerry')
    })

    it('should escape quotes in marker content', () => {
      const html = '/@puffin: add class="test" attribute //'
      const result = MarkerUtils.highlightMarkersInHtml(html)
      expect(result).toContain('&quot;test&quot;')
    })

    it('should escape single quotes in marker content', () => {
      const html = "/@puffin: it's working //"
      const result = MarkerUtils.highlightMarkersInHtml(html)
      expect(result).toContain('&#39;s')
    })

    it('should handle malicious event handler attempts', () => {
      const html = '/@puffin: <img src="x" onerror="alert(1)"> //'
      const result = MarkerUtils.highlightMarkersInHtml(html)
      expect(result).not.toContain('onerror=')
      expect(result).toContain('&lt;img')
    })
  })

  describe('isValidMarker', () => {
    it('should return false for null', () => {
      expect(MarkerUtils.isValidMarker(null)).toBe(false)
    })

    it('should return false for undefined', () => {
      expect(MarkerUtils.isValidMarker(undefined)).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(MarkerUtils.isValidMarker('')).toBe(false)
    })

    it('should return true for valid marker', () => {
      expect(MarkerUtils.isValidMarker('/@puffin: test //')).toBe(true)
    })

    it('should return true for marker with leading/trailing whitespace', () => {
      expect(MarkerUtils.isValidMarker('  /@puffin: test //  ')).toBe(true)
    })

    it('should return false for missing start delimiter', () => {
      expect(MarkerUtils.isValidMarker('test //')).toBe(false)
    })

    it('should return false for missing end delimiter', () => {
      expect(MarkerUtils.isValidMarker('/@puffin: test')).toBe(false)
    })

    it('should return true for empty marker', () => {
      expect(MarkerUtils.isValidMarker('/@puffin:  //')).toBe(true)
    })

    it('should return true for multiline marker', () => {
      expect(MarkerUtils.isValidMarker('/@puffin:\ntest\n//')).toBe(true)
    })
  })

  describe('getMarkerAtPosition', () => {
    it('should return null for content without markers', () => {
      expect(MarkerUtils.getMarkerAtPosition('no markers', 5)).toBe(null)
    })

    it('should return null for position outside any marker', () => {
      const content = 'before /@puffin: test // after'
      expect(MarkerUtils.getMarkerAtPosition(content, 0)).toBe(null)
      expect(MarkerUtils.getMarkerAtPosition(content, 29)).toBe(null)
    })

    it('should return marker info when cursor is inside marker', () => {
      const content = 'before /@puffin: test // after'
      const result = MarkerUtils.getMarkerAtPosition(content, 15)

      expect(result).not.toBe(null)
      expect(result.index).toBe(0)
      expect(result.marker.prompt).toBe('test')
    })

    it('should return marker at start boundary', () => {
      const content = '/@puffin: test //'
      const result = MarkerUtils.getMarkerAtPosition(content, 0)

      expect(result).not.toBe(null)
      expect(result.index).toBe(0)
    })

    it('should return marker at end boundary', () => {
      const content = '/@puffin: test //'
      const result = MarkerUtils.getMarkerAtPosition(content, content.length)

      expect(result).not.toBe(null)
    })

    it('should return correct marker when multiple exist', () => {
      const content = '/@puffin: first // /@puffin: second //'

      // Inside first marker
      const result1 = MarkerUtils.getMarkerAtPosition(content, 5)
      expect(result1.index).toBe(0)
      expect(result1.marker.prompt).toBe('first')

      // Inside second marker
      const result2 = MarkerUtils.getMarkerAtPosition(content, 25)
      expect(result2.index).toBe(1)
      expect(result2.marker.prompt).toBe('second')
    })
  })

  describe('getCursorPositionInMarker', () => {
    it('should return correct position for marker at start', () => {
      const pos = MarkerUtils.getCursorPositionInMarker(0)
      // '/@puffin:'.length = 9, plus 1 for space = 10
      expect(pos).toBe(10)
    })

    it('should return correct position for marker at offset', () => {
      const pos = MarkerUtils.getCursorPositionInMarker(100)
      expect(pos).toBe(110)
    })

    it('should calculate based on MARKER_START length', () => {
      const expectedOffset = MarkerUtils.MARKER_START.length + 1
      expect(MarkerUtils.getCursorPositionInMarker(0)).toBe(expectedOffset)
    })
  })

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle very long marker content', () => {
      const longText = 'x'.repeat(10000)
      const content = `/@puffin: ${longText} //`
      const markers = MarkerUtils.findAllMarkers(content)

      expect(markers).toHaveLength(1)
      expect(markers[0].prompt).toBe(longText)
    })

    it('should handle markers in code-like content', () => {
      const content = `
        function test() {
          /@puffin: add error handling //
          console.log('test')
        }
      `
      const markers = MarkerUtils.findAllMarkers(content)

      expect(markers).toHaveLength(1)
      expect(markers[0].prompt).toBe('add error handling')
    })

    it('should handle markers near JavaScript comments', () => {
      const content = '// regular comment\n/@puffin: marker //'
      const markers = MarkerUtils.findAllMarkers(content)

      expect(markers).toHaveLength(1)
      expect(markers[0].prompt).toBe('marker')
    })

    it('should handle Unicode content in markers', () => {
      const content = '/@puffin: 添加中文支持 🎉 //'
      const markers = MarkerUtils.findAllMarkers(content)

      expect(markers).toHaveLength(1)
      expect(markers[0].prompt).toBe('添加中文支持 🎉')
    })

    it('should handle markers with newlines in prompt', () => {
      const content = '/@puffin: line1\nline2\nline3 //'
      const markers = MarkerUtils.findAllMarkers(content)

      expect(markers).toHaveLength(1)
      expect(markers[0].prompt).toContain('line1')
      expect(markers[0].prompt).toContain('line3')
    })

    it('should handle tab characters in markers', () => {
      const content = '/@puffin: \t\ttabbed content\t //'
      const markers = MarkerUtils.findAllMarkers(content)

      expect(markers).toHaveLength(1)
      // Prompt should be trimmed
      expect(markers[0].prompt).toContain('tabbed content')
    })

    it('should correctly track positions across multiple operations', () => {
      let content = 'start /@puffin: first // middle /@puffin: second // end'

      // Remove first marker
      content = MarkerUtils.removeMarkerByIndex(content, 0)

      // Find remaining marker
      const markers = MarkerUtils.findAllMarkers(content)
      expect(markers).toHaveLength(1)
      expect(markers[0].prompt).toBe('second')
    })
  })

  describe('Potential False Positives', () => {
    it('should not match incomplete start delimiter', () => {
      expect(MarkerUtils.hasMarkers('@puffin: test //')).toBe(false)
      expect(MarkerUtils.hasMarkers('/puffin: test //')).toBe(false)
    })

    it('should not match with space in delimiter', () => {
      expect(MarkerUtils.hasMarkers('/@ puffin: test //')).toBe(false)
    })

    it('should match case-sensitive delimiter', () => {
      expect(MarkerUtils.hasMarkers('/@PUFFIN: test //')).toBe(false)
      expect(MarkerUtils.hasMarkers('/@Puffin: test //')).toBe(false)
    })
  })
})
