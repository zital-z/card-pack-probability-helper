import { ROLES } from '../data/roles'
import type {
  CalculationResult,
  GameConfig,
  PackRecord,
  QtrContinuity,
  RoleId,
  RoleProbability,
} from '../types'

const alpha = 1

export function getActualPrice(config: GameConfig) {
  const count = Math.max(1, config.plannedPackCount)
  return Math.max(0, config.packPrice * count - config.couponDiscount) / count
}

export function calculateAtLeastOneHitProbability(pHit: number, n: number) {
  return 1 - Math.pow(1 - pHit, Math.max(0, n))
}

function combination(n: number, k: number) {
  if (k < 0 || k > n) return 0
  const smallerK = Math.min(k, n - k)
  let result = 1

  for (let index = 1; index <= smallerK; index += 1) {
    result = (result * (n - smallerK + index)) / index
  }

  return result
}

export function calculateAtLeastKHitProbability(pHit: number, n: number, k: number) {
  const trials = Math.max(0, Math.floor(n))
  const target = Math.max(1, Math.floor(k))
  if (target > trials) return 0

  let cumulativeBelowTarget = 0
  for (let hits = 0; hits < target; hits += 1) {
    cumulativeBelowTarget +=
      combination(trials, hits) *
      Math.pow(pHit, hits) *
      Math.pow(1 - pHit, trials - hits)
  }

  return Math.max(0, Math.min(1, 1 - cumulativeBelowTarget))
}

export function calculateExpectedCost(pHit: number, config: GameConfig) {
  return getActualPrice(config) / (1 + config.rewardBoxPacks * pHit)
}

function ageWeight(age: number) {
  if (age < 10) return 2
  if (age < 30) return 1.4
  if (age < 60) return 1
  if (age < 120) return 0.5
  return 0
}

function emptyRoleMap(value = 0) {
  return Object.fromEntries(ROLES.map((role) => [role.id, value])) as Record<RoleId, number>
}

function sortedRecords(records: PackRecord[]) {
  return [...records].sort((a, b) => a.sequence - b.sequence)
}

export function calculateWeightedSSRCounts(records: PackRecord[], continuity = 0.75) {
  const counts = emptyRoleMap()
  const ordered = sortedRecords(records)
  const maxSequence = Math.max(0, ...ordered.map((record) => record.sequence))

  for (const record of ordered) {
    if (!record.ssrRole) continue
    const age = maxSequence - record.sequence
    const continuityDiscount = age >= 30 ? continuity : 1
    counts[record.ssrRole] += ageWeight(age) * continuityDiscount
  }

  return counts
}

export function calculateWeightedURCounts(records: PackRecord[]) {
  const counts = emptyRoleMap()
  const ordered = sortedRecords(records)
  const maxSequence = Math.max(0, ...ordered.map((record) => record.sequence))

  for (const record of ordered) {
    if (!record.urRole) continue
    const age = maxSequence - record.sequence
    counts[record.urRole] += age < 20 ? 8 : 6
  }

  return counts
}

function qtrNumber(qtrId?: string) {
  const match = qtrId?.match(/\d+/)
  return match ? Number(match[0]) : undefined
}

export function calculateQTRContinuity(records: PackRecord[]): QtrContinuity {
  const qtrs = sortedRecords(records)
    .filter((record) => record.qtrId)
    .slice(-4)
    .map((record) => qtrNumber(record.qtrId))
    .filter((value): value is number => typeof value === 'number')

  if (qtrs.length < 2) {
    return { score: 0.75, label: '不确定', detail: 'QTR记录少，暂时按中性连续性处理' }
  }

  let sequentialPairs = 0
  let jumpPairs = 0

  for (let index = 1; index < qtrs.length; index += 1) {
    const prev = qtrs[index - 1]
    const current = qtrs[index]
    const diff = current - prev
    if (diff === 1 || diff === -9) sequentialPairs += 1
    if (Math.abs(diff) > 3 && diff !== -9) jumpPairs += 1
  }

  const pairs = qtrs.length - 1
  if (sequentialPairs / pairs >= 0.67) {
    return { score: 1, label: '连续', detail: `最近QTR顺序为 ${qtrs.join(' → ')}，池子延续性较强` }
  }

  if (jumpPairs > 0) {
    return { score: 0.5, label: '疑似换池', detail: `最近QTR顺序为 ${qtrs.join(' → ')}，旧数据权重下调` }
  }

  return { score: 0.75, label: '不确定', detail: `最近QTR顺序为 ${qtrs.join(' → ')}，暂时按中性处理` }
}

function recentRoleCount(records: PackRecord[], roleId: RoleId, windowSize: number) {
  const ordered = sortedRecords(records)
  const maxSequence = Math.max(0, ...ordered.map((record) => record.sequence))
  return ordered.filter(
    (record) => record.ssrRole === roleId && maxSequence - record.sequence < windowSize,
  ).length
}

function hasVariantPair(records: PackRecord[], roleId: RoleId) {
  const variants = new Set(
    records
      .filter((record) => record.ssrRole === roleId)
      .map((record) => record.ssrVariant)
      .filter(Boolean),
  )
  return variants.has('gold') && variants.has('silver')
}

export function calculateRoleScores(records: PackRecord[], config: GameConfig, qtr: QtrContinuity) {
  const weightedSSR = calculateWeightedSSRCounts(records, qtr.score)
  const weightedUR = calculateWeightedURCounts(records)
  const scores = emptyRoleMap(alpha)
  const reasons = Object.fromEntries(ROLES.map((role) => [role.id, [] as string[]])) as Record<
    RoleId,
    string[]
  >

  for (const role of ROLES) {
    const recent10 = recentRoleCount(records, role.id, 10)
    const recent20 = recentRoleCount(records, role.id, 20)
    const ssrScore = weightedSSR[role.id]
    const urScore = weightedUR[role.id]
    const streakBonus = recent20 >= 2 ? Math.min(1.5, recent20 * 0.35) : 0
    const pairBonus = hasVariantPair(records, role.id) ? 0.35 : 0
    const modeMultiplier =
      config.mode === 'singleBoxSequential' && recent10 >= 2 ? 0.92 : 1

    scores[role.id] = (alpha + ssrScore + urScore + streakBonus + pairBonus) * modeMultiplier

    if (recent10 > 0) reasons[role.id].push(`最近10包SSR ${recent10}次`)
    if (recent20 >= 2) reasons[role.id].push(`最近20包重复出现`)
    if (urScore > 0) reasons[role.id].push(`近期UR强信号`)
    if (pairBonus > 0) reasons[role.id].push(`金银配对弱信号`)
    if (qtr.score >= 1 && ssrScore > 0) reasons[role.id].push(`QTR连续，近期记录可信度较高`)
    if (reasons[role.id].length === 0) reasons[role.id].push('主要来自均匀先验')
  }

  return { scores, reasons }
}

export function normalizeScoresToProbabilities(scores: Record<RoleId, number>) {
  const total = Object.values(scores).reduce((sum, value) => sum + value, 0)
  return Object.fromEntries(
    ROLES.map((role) => [role.id, total > 0 ? scores[role.id] / total : 1 / ROLES.length]),
  ) as Record<RoleId, number>
}

function recommendationLevel(pHit: number): RoleProbability['level'] {
  if (pHit >= 0.1) return '强信号'
  if (pHit >= 0.08) return '优势明显'
  if (pHit >= 0.0615) return '可考虑'
  if (pHit >= 0.0519) return '小注'
  return '观望'
}

function calculateConfidence(records: PackRecord[], qtr: QtrContinuity): CalculationResult['confidence'] {
  if (records.length < 20) return 'low'
  if (records.length >= 50 && qtr.score >= 0.75) return 'high'
  return qtr.score < 0.75 ? 'low' : 'medium'
}

export function calculateProbabilities(records: PackRecord[], config: GameConfig): CalculationResult {
  const qtrContinuity = calculateQTRContinuity(records)
  const { scores, reasons } = calculateRoleScores(records, config, qtrContinuity)
  const probabilities = normalizeScoresToProbabilities(scores)
  const blindHitRate = config.pSSRSlot / ROLES.length
  const actualPrice = getActualPrice(config)
  const observedSSRSlotRate =
    records.length > 0 ? records.filter((record) => record.ssrRole).length / records.length : 0

  const rows = ROLES.map((role) => {
    const pRoleGivenSSR = probabilities[role.id]
    const pHit = config.pSSRSlot * pRoleGivenSSR
    return {
      role,
      rank: 0,
      score: scores[role.id],
      pRoleGivenSSR,
      pHit,
      expectedCost: calculateExpectedCost(pHit, config),
      atLeastOneHit: calculateAtLeastOneHitProbability(pHit, config.plannedPackCount),
      liftVsBlind: blindHitRate > 0 ? pHit / blindHitRate : 0,
      level: recommendationLevel(pHit),
      reasons: reasons[role.id],
    }
  }).sort((a, b) => b.pHit - a.pHit)

  rows.forEach((row, index) => {
    row.rank = index + 1
  })

  const warnings: string[] = ['估算值，不是官方概率；模型用于辅助观察，不保证盈利。']
  if (records.length < 20) warnings.push('样本不足，结果会明显回归盲选概率。')
  if (qtrContinuity.score < 0.75) warnings.push('QTR信号疑似断层，旧数据权重已下降。')
  if (rows[0]?.pHit < 0.0519) warnings.push('Top1仍低于优于6.5元渠道价的大致阈值，仅建议娱乐观察。')

  return {
    rows,
    topRows: rows.slice(0, 3),
    blindHitRate,
    actualPrice,
    observedSSRSlotRate,
    qtrContinuity,
    confidence: calculateConfidence(records, qtrContinuity),
    warnings,
  }
}
