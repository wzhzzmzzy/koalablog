import { useTodoPlugin } from '@/lib/markdown/todo-plugin'
import MarkdownIt from 'markdown-it'
import { describe, expect, it } from 'vitest'

describe('todo-plugin', () => {
  const createMd = () => {
    const md = new MarkdownIt()
    useTodoPlugin(md)
    return md
  }

  describe('basic functionality', () => {
    it('should parse unchecked item', () => {
      const md = createMd()
      const result = md.render('- [ ] Unchecked item')

      expect(result).toContain('task-list-item')
      expect(result).not.toContain('class="task-list-item checked"') // Should verify it doesn't have checked class
      expect(result).toContain('lucide-square')
      expect(result).toContain('Unchecked item')
    })

    it('should parse checked item [x]', () => {
      const md = createMd()
      const result = md.render('- [x] Checked item')

      expect(result).toContain('task-list-item')
      expect(result).toContain('checked')
      expect(result).toContain('lucide-square-check')
      expect(result).toContain('Checked item')
    })
    
    it('should parse checked item [X]', () => {
      const md = createMd()
      const result = md.render('- [X] Checked item upper')

      expect(result).toContain('task-list-item')
      expect(result).toContain('checked')
      expect(result).toContain('lucide-square-check')
    })
  })

  describe('nested lists', () => {
    it('should handle nested todo lists', () => {
        const md = createMd()
        const result = md.render(
`- [ ] Parent
  - [x] Child
`)
        expect(result).toContain('Parent')
        expect(result).toContain('Child')
        // Check occurrences
        const matches = result.match(/task-list-item/g)
        expect(matches?.length).toBe(2)
    })
  })

  describe('invalid cases', () => {
    it('should ignore [ ] without space', () => {
        const md = createMd()
        const result = md.render('- [ ]No space')
        expect(result).not.toContain('task-list-item')
        expect(result).toContain('[ ]No space')
    })

    it('should ignore if not at start of item', () => {
        const md = createMd()
        const result = md.render('- some text [ ] not start')
        expect(result).not.toContain('task-list-item')
    })
    
    it('should ignore in paragraph', () => {
        const md = createMd()
        const result = md.render('not a list [ ] item')
        expect(result).not.toContain('task-list-item')
    })
  })
})
