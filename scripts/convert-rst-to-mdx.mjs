import fs from 'node:fs/promises'
import path from 'node:path'

const repoRoot = process.cwd()
const docsDir = path.join(repoRoot, 'docs')
const contentDir = path.join(repoRoot, 'content')

const titleOverrides = {
  index: 'Home',
  sample_metadata: 'Metadata and QC',
  metadata_sqlite: 'SQLite Metadata',
  species_id: 'Species Calls',
  bgcs: 'Biosynthetic Gene Clusters',
  faq: 'FAQ',
  ebi2osf: 'Migration From EBI To OSF'
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function slugify(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
}

function stripInvisible(value) {
  return value.replace(/[\u200b-\u200d\uFEFF]/g, '')
}

function isUnderline(line) {
  return /^(=+|-+|~+|\^+)$/.test(line.trim())
}

function headingLevel(marker) {
  if (marker.startsWith('=')) return '#'
  if (marker.startsWith('-')) return '##'
  if (marker.startsWith('~')) return '###'
  return '####'
}

function trimBlankEdges(lines) {
  let start = 0
  let end = lines.length
  while (start < end && lines[start].trim() === '') start += 1
  while (end > start && lines[end - 1].trim() === '') end -= 1
  return lines.slice(start, end)
}

function indentOf(line) {
  const match = line.match(/^ */)
  return match ? match[0].length : 0
}

function normalizeCellText(lines) {
  const text = lines
    .map(line => line.trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return convertInline(text)
}

function convertInline(text, refTitles = new Map()) {
  let out = stripInvisible(text)

  out = out.replace(/``([^`]+)``/g, '`$1`')
  out = out.replaceAll('<->', '&lt;-&gt;')
  out = out.replace(/:sup:`([^`]+)`/g, '<sup>$1</sup>')
  out = out.replace(/:doc:`([^`<]+?)\s*<\/([^`>]+)>`/g, (_, label, target) => {
    return `[${label.trim()}](/${target.trim()})`
  })
  out = out.replace(/:doc:`<\/([^`>]+)>`/g, (_, target) => {
    const cleanTarget = target.trim()
    const fallback = cleanTarget
      .split('/')
      .filter(Boolean)
      .pop()
      ?.replace(/_/g, ' ') || cleanTarget
    return `[${fallback}](/${cleanTarget})`
  })
  out = out.replace(/:ref:`([^`]+)`/g, (_, target) => {
    const cleanTarget = stripInvisible(target).trim()
    const label = refTitles.get(cleanTarget) || cleanTarget.replace(/-/g, ' ')
    return `[${label}](#${cleanTarget})`
  })
  out = out.replace(/`([^`]+?) <([^>]+)>`__/g, '[$1]($2)')
  out = out.replace(/`([^`]+?) <([^>]+)>`_/g, '[$1]($2)')

  return out
}

function parseListTable(lines, start, refTitles) {
  let i = start + 1
  let headerRows = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      i += 1
      continue
    }
    if (/^\s*:header-rows:\s*\d+/.test(line)) {
      headerRows = Number(line.match(/(\d+)/)?.[1] || 0)
      i += 1
      continue
    }
    if (/^\s*:/.test(line)) {
      i += 1
      continue
    }
    break
  }

  const rows = []
  let currentRow = null
  let currentCell = null

  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      const next = lines[i + 1]
      if (!next || !/^\s+[\*-]\s/.test(next)) {
        i += 1
        break
      }
      i += 1
      continue
    }

    const rowMatch = line.match(/^\s*\*\s-\s(.*)$/)
    if (rowMatch) {
      currentRow = [[rowMatch[1]]]
      rows.push(currentRow)
      currentCell = currentRow[0]
      i += 1
      continue
    }

    const cellMatch = line.match(/^\s+-\s(.*)$/)
    if (cellMatch && currentRow) {
      currentRow.push([cellMatch[1]])
      currentCell = currentRow[currentRow.length - 1]
      i += 1
      continue
    }

    if (/^\s{4,}\S/.test(line) && currentCell) {
      currentCell.push(line.trim())
      i += 1
      continue
    }

    break
  }

  const html = ['<table>']
  rows.forEach((row, index) => {
    if (index === 0 && headerRows > 0) {
      html.push('  <thead>')
      html.push('    <tr>')
      row.forEach(cell => {
        html.push(`      <th>${normalizeCellText(cell, refTitles)}</th>`)
      })
      html.push('    </tr>')
      html.push('  </thead>')
      if (rows.length > 1) html.push('  <tbody>')
      return
    }

    if (headerRows === 0 && index === 0) html.push('  <tbody>')
    html.push('    <tr>')
    row.forEach(cell => {
      html.push(`      <td>${normalizeCellText(cell, refTitles)}</td>`)
    })
    html.push('    </tr>')
  })
  html.push('  </tbody>')
  html.push('</table>')

  return { output: html, nextIndex: i }
}

function parseIndentedBlock(lines, start) {
  let i = start
  while (i < lines.length && lines[i].trim() === '') i += 1

  const baseIndent = i < lines.length ? indentOf(lines[i]) : 0
  const block = []
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      const nextNonBlank = lines.slice(i + 1).find(candidate => candidate.trim() !== '')
      if (
        nextNonBlank &&
        indentOf(nextNonBlank) <= baseIndent &&
        /^[A-Z(]/.test(nextNonBlank.trim())
      ) {
        break
      }
      block.push('')
      i += 1
      continue
    }
    if (indentOf(line) < baseIndent) break
    block.push(line.slice(baseIndent))
    i += 1
  }

  while (block.length > 0 && block[block.length - 1] === '') block.pop()
  return { block, nextIndex: i }
}

function collectRefTitles(lines) {
  const map = new Map()
  for (let i = 0; i < lines.length - 2; i += 1) {
    const anchorMatch = stripInvisible(lines[i]).match(/^\.\. _(.+):$/)
    if (!anchorMatch) continue
    const heading = stripInvisible(lines[i + 1] || '').trim()
    const underline = stripInvisible(lines[i + 2] || '').trim()
    if (heading && isUnderline(underline)) {
      map.set(stripInvisible(anchorMatch[1]).trim(), heading)
    }
  }
  return map
}

function convertRstToMdx(source, slug) {
  const normalizedSource = source
    .replace(/\r\n/g, '\n')
    .replace(/`([^`\n]+?)\n\s*<([^>]+)>`_/g, '`$1 <$2>`_')
  const lines = normalizedSource.split('\n')
  const refTitles = collectRefTitles(lines)
  const firstHeadingIndex = lines.findIndex(
    (line, index) => index < lines.length - 1 && line.trim() && isUnderline(stripInvisible(lines[index + 1]))
  )
  const detectedTitle =
    firstHeadingIndex >= 0 ? stripInvisible(lines[firstHeadingIndex]).trim() : slug.replace(/_/g, ' ')
  const output = [
    '---',
    `title: ${JSON.stringify(titleOverrides[slug] || detectedTitle)}`,
    '---',
    ''
  ]

  let pendingAnchor = null

  for (let i = 0; i < lines.length; ) {
    const rawLine = lines[i]
    const line = stripInvisible(rawLine)
    const trimmed = line.trim()

    if (
      isUnderline(trimmed) &&
      i + 2 < lines.length &&
      lines[i + 1].trim() &&
      isUnderline(stripInvisible(lines[i + 2]).trim()) &&
      stripInvisible(lines[i + 2]).trim()[0] === trimmed[0]
    ) {
      if (pendingAnchor) {
        output.push(`<a id="${pendingAnchor}"></a>`)
        output.push('')
        pendingAnchor = null
      }
      output.push(`${headingLevel(trimmed)} ${convertInline(stripInvisible(lines[i + 1]).trim(), refTitles)}`)
      output.push('')
      i += 3
      continue
    }

    if (trimmed.startsWith('.. AllTheBacteria documentation master file')) {
      while (i < lines.length && lines[i].trim() !== '') i += 1
      continue
    }

    if (/^\.\. _.+:$/.test(trimmed)) {
      pendingAnchor = trimmed.replace(/^\.\. _/, '').replace(/:$/, '').trim()
      i += 1
      continue
    }

    if (i + 1 < lines.length && isUnderline(stripInvisible(lines[i + 1]))) {
      if (pendingAnchor) {
        output.push(`<a id="${pendingAnchor}"></a>`)
        output.push('')
        pendingAnchor = null
      }
      output.push(`${headingLevel(stripInvisible(lines[i + 1]).trim())} ${convertInline(trimmed, refTitles)}`)
      output.push('')
      i += 2
      continue
    }

    if (trimmed === '.. toctree::') {
      i += 1
      while (i < lines.length) {
        const toctreeLine = lines[i]
        if (toctreeLine.trim() === '') {
          i += 1
          continue
        }
        if (!toctreeLine.startsWith(' ') && !toctreeLine.startsWith('\t')) break
        i += 1
      }
      continue
    }

    if (trimmed.startsWith('.. list-table::')) {
      const table = parseListTable(lines, i, refTitles)
      output.push(...table.output, '')
      i = table.nextIndex
      continue
    }

    const codeMatch = trimmed.match(/^\.\. code-block::\s*(\w+)?$/)
    if (codeMatch) {
      const language = codeMatch[1] || ''
      const { block, nextIndex } = parseIndentedBlock(lines, i + 1)
      output.push(`\`\`\`${language}`)
      output.push(...block)
      output.push('```', '')
      i = nextIndex
      continue
    }

    if (trimmed.endsWith('::') && !trimmed.startsWith('.. ')) {
      const text = trimmed === '::' ? '' : convertInline(trimmed.slice(0, -1), refTitles)
      if (text) {
        output.push(text)
        output.push('')
      }
      const { block, nextIndex } = parseIndentedBlock(lines, i + 1)
      output.push('```')
      output.push(...block)
      output.push('```', '')
      i = nextIndex
      continue
    }

    if (trimmed.startsWith('.. ')) {
      i += 1
      continue
    }

    output.push(convertInline(line, refTitles))
    i += 1
  }

  return `${trimBlankEdges(output).join('\n')}\n`
}

async function main() {
  const files = (await fs.readdir(docsDir))
    .filter(file => file.endsWith('.rst'))
    .sort()

  await fs.rm(contentDir, { recursive: true, force: true })
  await fs.mkdir(contentDir, { recursive: true })

  const indexSource = await fs.readFile(path.join(docsDir, 'index.rst'), 'utf8')
  const toctree = []
  const titles = new Map()
  for (const file of files) {
    const slug = file.replace(/\.rst$/, '')
    const source = await fs.readFile(path.join(docsDir, file), 'utf8')
    const lines = source.replace(/\r\n/g, '\n').split('\n')
    const firstHeadingIndex = lines.findIndex(
      (line, index) => index < lines.length - 1 && line.trim() && isUnderline(stripInvisible(lines[index + 1]))
    )
    const detectedTitle =
      firstHeadingIndex >= 0 ? stripInvisible(lines[firstHeadingIndex]).trim() : slug.replace(/_/g, ' ')
    titles.set(slug, titleOverrides[slug] || detectedTitle)
  }
  let inToctree = false
  for (const rawLine of indexSource.split('\n')) {
    const line = rawLine.trim()
    if (line === '.. toctree::') {
      inToctree = true
      continue
    }
    if (!inToctree) continue
    if (line === '') continue
    if (line.startsWith(':')) continue
    if (!rawLine.startsWith('   ')) break
    toctree.push(line)
  }

  for (const file of files) {
    const slug = file.replace(/\.rst$/, '')
    const source = await fs.readFile(path.join(docsDir, file), 'utf8')
    const mdx = convertRstToMdx(source, slug)
    await fs.writeFile(path.join(contentDir, `${slug}.mdx`), mdx)
  }

  const metaLines = ['export default {']
  metaLines.push(`  index: 'Home',`)
  for (const slug of toctree) {
    metaLines.push(`  ${JSON.stringify(slug)}: ${JSON.stringify(titles.get(slug) || slug.replace(/_/g, ' '))},`)
  }
  metaLines.push('}')
  metaLines.push('')

  await fs.writeFile(path.join(contentDir, '_meta.js'), metaLines.join('\n'))
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
