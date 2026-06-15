import type { CardVariant, PackRecord, RoleId } from '../types'

const ROLE_IDS = new Set(
  Array.from({ length: 19 }, (_, index) => String(index + 1).padStart(2, '0')),
)

function cleanRole(value?: string): RoleId | '' {
  const trimmed = value?.trim()
  if (!trimmed) return ''
  const match = trimmed.match(/\d{1,2}/)
  const normalized = match ? match[0].padStart(2, '0') : trimmed
  return ROLE_IDS.has(normalized) ? (normalized as RoleId) : ''
}

function cleanVariant(value?: string): CardVariant {
  const trimmed = value?.trim().toLowerCase()
  if (!trimmed) return ''
  if (trimmed.includes('金') || trimmed === 'gold' || trimmed === 'b') return 'gold'
  if (trimmed.includes('银') || trimmed === 'silver' || trimmed === 'a') return 'silver'
  return 'unknown'
}

function cleanBool(value?: string) {
  const trimmed = value?.trim().toLowerCase()
  return trimmed === '1' || trimmed === 'true' || trimmed === 'yes' || trimmed === 'y' || trimmed === '是'
}

function splitCsvLine(line: string) {
  const cells: string[] = []
  let current = ''
  let quoted = false

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted
      continue
    }
    if (char === ',' && !quoted) {
      cells.push(current)
      current = ''
      continue
    }
    current += char
  }

  cells.push(current)
  return cells
}

export function parseCsvRecords(text: string, startingSequence = 1): PackRecord[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return []

  const firstCells = splitCsvLine(lines[0]).map((cell) => cell.trim())
  const hasHeader = firstCells.some((cell) => /sequence|ssrRole|urRole|qtrId/i.test(cell))
  const headers = hasHeader
    ? firstCells
    : ['sequence', 'ssrRole', 'ssrVariant', 'urRole', 'qtrId', 'erHit', 'spHit', 'note']
  const dataLines = hasHeader ? lines.slice(1) : lines

  return dataLines.map((line, index) => {
    const cells = splitCsvLine(line)
    const values = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] ?? '']))
    const sequence = Number(values.sequence) || startingSequence + index

    return {
      id: crypto.randomUUID(),
      sequence,
      ssrRole: cleanRole(values.ssrRole ?? values.ssr ?? values['SSR角色']),
      ssrVariant: cleanVariant(values.ssrVariant ?? values.variant ?? values['金银']),
      urRole: cleanRole(values.urRole ?? values.ur ?? values['UR角色']),
      qtrId: (values.qtrId ?? values.qtr ?? values['QTR编号'] ?? '').trim(),
      erHit: cleanBool(values.erHit ?? values.er ?? values.ER),
      spHit: cleanBool(values.spHit ?? values.sp ?? values.SP),
      note: (values.note ?? values['备注'] ?? '').trim(),
    }
  })
}

function escapeCell(value: unknown) {
  const text = String(value ?? '')
  return text.includes(',') || text.includes('"') || text.includes('\n')
    ? `"${text.replaceAll('"', '""')}"`
    : text
}

export function recordsToCsv(records: PackRecord[]) {
  const headers = ['sequence', 'ssrRole', 'ssrVariant', 'urRole', 'qtrId', 'erHit', 'spHit', 'note']
  const lines = records.map((record) =>
    [
      record.sequence,
      record.ssrRole,
      record.ssrVariant,
      record.urRole,
      record.qtrId,
      record.erHit ? '1' : '',
      record.spHit ? '1' : '',
      record.note,
    ]
      .map(escapeCell)
      .join(','),
  )

  return [headers.join(','), ...lines].join('\n')
}
