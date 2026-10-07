/**
 * Markdown → HTML, done once at build time.
 *
 * Security: `html: false` means raw HTML in content is escaped, not passed through.
 * Combined with the fact that content is reviewed in pull requests, this removes the
 * XSS surface that runtime Markdown rendering would create. The app only ever receives
 * HTML produced by this file.
 */
import MarkdownIt from 'markdown-it'
import container from 'markdown-it-container'
import anchor from 'markdown-it-anchor'
import hljs from 'highlight.js'
import { BLOCKS, BLOCK_NAMES } from './blocks.mjs'

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function highlight(code, lang) {
  const language = (lang || '').trim().toLowerCase()
  const alias = { rb: 'ruby', js: 'javascript', ts: 'typescript', sh: 'bash', psql: 'sql', plain: '' }
  const resolved = alias[language] ?? language
  if (resolved && hljs.getLanguage(resolved)) {
    try {
      return hljs.highlight(code, { language: resolved, ignoreIllegals: true }).value
    } catch {
      /* fall through to escaped plain text */
    }
  }
  return escapeHtml(code)
}

export function createRenderer() {
  const md = new MarkdownIt({
    html: false, // never trust raw HTML from content
    linkify: true,
    typographer: true,
    breaks: false,
  })

  md.use(anchor, {
    level: [2, 3],
    slugify: (s) =>
      s.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-'),
    permalink: anchor.permalink.linkInsideHeader({
      symbol: '#',
      placement: 'after',
      class: 'heading-anchor',
      ariaHidden: false,
    }),
  })

  // Each pedagogical block becomes <section data-block="why"> so the reader can
  // filter by mode and assistive tech gets a labelled region.
  for (const name of BLOCK_NAMES) {
    const spec = BLOCKS[name]
    md.use(container, name, {
      render(tokens, idx) {
        if (tokens[idx].nesting === 1) {
          const info = tokens[idx].info.trim().slice(name.length).trim()
          const title = info || spec.label
          return (
            `<section class="lesson-block" data-block="${name}" data-tone="${spec.tone}" aria-label="${escapeHtml(title)}">` +
            `<header class="lesson-block__head">` +
            `<span class="lesson-block__icon" data-icon="${spec.icon}" aria-hidden="true"></span>` +
            `<h4 class="lesson-block__title">${escapeHtml(title)}</h4>` +
            `</header>` +
            `<div class="lesson-block__body">`
          )
        }
        return '</div></section>\n'
      },
    })
  }

  // Code fences: highlighted at build time, with a language label and copy affordance.
  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx]
    const raw = token.info.trim()
    const [lang = '', ...flags] = raw.split(/\s+/)
    const runnable = flags.includes('runnable')
    const label = lang || 'text'
    const highlighted = highlight(token.content, lang)
    return (
      `<figure class="code" data-lang="${escapeHtml(label)}"${runnable ? ' data-runnable="true"' : ''}>` +
      `<figcaption class="code__lang">${escapeHtml(label)}</figcaption>` +
      `<pre class="code__pre"><code class="hljs language-${escapeHtml(label)}">${highlighted}</code></pre>` +
      `<button type="button" class="code__copy" data-copy aria-label="Copy ${escapeHtml(label)} code">Copy</button>` +
      `</figure>\n`
    )
  }

  // Tables get a scroll wrapper so they never break narrow layouts.
  const defaultTableOpen = md.renderer.rules.table_open
  md.renderer.rules.table_open = (tokens, idx, options, env, self) =>
    '<div class="table-scroll">' +
    (defaultTableOpen
      ? defaultTableOpen(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options))

  const defaultTableClose = md.renderer.rules.table_close
  md.renderer.rules.table_close = (tokens, idx, options, env, self) =>
    (defaultTableClose
      ? defaultTableClose(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options)) + '</div>'

  // Internal links keep SPA navigation; external links are marked and made safe.
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const href = tokens[idx].attrGet('href') ?? ''
    if (/^https?:\/\//.test(href)) {
      tokens[idx].attrSet('target', '_blank')
      tokens[idx].attrSet('rel', 'noopener noreferrer')
      tokens[idx].attrJoin('class', 'link-external')
    } else {
      tokens[idx].attrSet('data-internal', 'true')
    }
    return self.renderToken(tokens, idx, options)
  }

  return md
}

/** Parse `---`-delimited YAML frontmatter off the top of a file. */
export function splitFrontmatter(source) {
  const normalised = source.replace(/^\uFEFF/, '') // strip a byte-order mark
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(normalised)
  if (!match) return { frontmatter: '', body: normalised }
  return { frontmatter: match[1], body: normalised.slice(match[0].length) }
}

/** Which blocks and headings a rendered lesson contains, plus plain text for search. */
export function analyse(md, body) {
  const tokens = md.parse(body, {})
  const blocks = new Set()
  const headings = []
  const textParts = []

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.type.startsWith('container_') && t.nesting === 1) {
      blocks.add(t.type.replace(/^container_/, '').replace(/_open$/, ''))
    }
    if (t.type === 'heading_open') {
      const inline = tokens[i + 1]
      if (inline?.type === 'inline') {
        headings.push({ depth: Number(t.tag.slice(1)), text: inline.content })
      }
    }
    if (t.type === 'inline') textParts.push(t.content)
    if (t.type === 'fence') textParts.push(t.content)
  }

  return { blocks: [...blocks], headings, text: textParts.join('\n') }
}
