import { BOX_SAMPLES } from '../data/boxSamples'
import { ROLES } from '../data/roles'
import type {
  CalculationResult,
  ConfigurationSignal,
  GameConfig,
  PackRecord,
  QtrContinuity,
  RoleId,
  RoleProbability,
} from '../types'

const alpha = 1

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

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

function sortedSSRRecords(records: PackRecord[]) {
  return sortedRecords(records).filter((record) => record.ssrRole)
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

function calculateObservedSSRCounts(records: PackRecord[]) {
  const counts = emptyRoleMap()
  for (const record of records) {
    if (record.ssrRole) counts[record.ssrRole] += 1
  }
  return counts
}

function countsFromRoles(roles: RoleId[]) {
  const counts = emptyRoleMap()
  for (const roleId of roles) {
    counts[roleId] += 1
  }
  return counts
}

function sampleRoleSet(roles: RoleId[]) {
  return new Set(roles)
}

const boxSampleStats = (() => {
  const presentBoxes = emptyRoleMap()
  const duplicateBoxes = emptyRoleMap()
  const totalAppearances = emptyRoleMap()

  for (const sample of BOX_SAMPLES) {
    const counts = countsFromRoles(sample.roles)
    for (const role of ROLES) {
      const count = counts[role.id]
      if (count > 0) presentBoxes[role.id] += 1
      if (count >= 2) duplicateBoxes[role.id] += 1
      totalAppearances[role.id] += count
    }
  }

  return {
    boxCount: BOX_SAMPLES.length,
    presentBoxes,
    duplicateBoxes,
    totalAppearances,
  }
})()

function calculateWindowCounts(records: PackRecord[], windowSize: number) {
  const counts = emptyRoleMap()
  const ssrRecords = sortedSSRRecords(records).slice(-windowSize)
  for (const record of ssrRecords) {
    if (record.ssrRole) counts[record.ssrRole] += 1
  }
  return counts
}

function isFilledRecord(record: PackRecord) {
  return Boolean(record.ssrRole || record.urRole || record.qtrId || record.erHit || record.spHit)
}

function numericPosition(value?: number | '') {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function inferredRowTotals(records: PackRecord[]) {
  const totals = new Map<string, number>()
  let currentTotal: number | undefined

  for (const record of sortedRecords(records)) {
    const ownTotal = numericPosition(record.rowTotalBefore)
    if (ownTotal) currentTotal = ownTotal
    if (currentTotal) totals.set(record.id, currentTotal)
    if (currentTotal && isFilledRecord(record)) currentTotal = Math.max(0, currentTotal - 1)
  }

  return totals
}

function positionedSSRRecords(records: PackRecord[], config: GameConfig) {
  const rowTotals = inferredRowTotals(records)

  return sortedSSRRecords(records)
    .map((record) => {
      const sidePosition = numericPosition(record.sidePosition)
      if (!record.side || !sidePosition || !record.ssrRole) return undefined

      if (config.basketLayoutMode === 'singleRow') {
        const rowTotal = numericPosition(record.rowTotalBefore) ?? rowTotals.get(record.id)
        const index =
          record.side === 'right' && rowTotal ? Math.max(1, rowTotal - sidePosition + 1) : sidePosition
        return {
          record,
          lane: 'single-row',
          index,
          roleId: record.ssrRole,
        }
      }

      return {
        record,
        lane: record.side,
        index: sidePosition,
        roleId: record.ssrRole,
      }
    })
    .filter(
      (
        item,
      ): item is {
        record: PackRecord
        lane: string
        index: number
        roleId: RoleId
      } => Boolean(item),
    )
}

function calculateLocalPositionMatchScores(
  records: PackRecord[],
  config: GameConfig,
): Record<string, { score: number; evidenceCount: number }> {
  const positioned = positionedSSRRecords(records, config)
  if (positioned.length < 4) return {}

  const latest = positioned[positioned.length - 1]
  const localWindow = positioned
    .filter((item) => item.lane === latest.lane && Math.abs(item.index - latest.index) <= 18)
    .slice(-18)
  const evidence = localWindow.length >= 4 ? localWindow : positioned.slice(-12)
  const localCounts = emptyRoleMap()
  const localRoles = new Set<RoleId>()

  for (const item of evidence) {
    const distance = Math.abs(item.index - latest.index)
    const distanceWeight = item.lane === latest.lane ? clamp(1 - distance / 24, 0.35, 1) : 0.45
    const age = Math.max(0, latest.record.sequence - item.record.sequence)
    const recencyWeight = age <= 16 ? 1 : age <= 40 ? 0.75 : 0.5
    localCounts[item.roleId] += distanceWeight * recencyWeight
    localRoles.add(item.roleId)
  }

  const totalLocalWeight = Object.values(localCounts).reduce((sum, value) => sum + value, 0)
  if (totalLocalWeight <= 0) return {}

  return Object.fromEntries(
    BOX_SAMPLES.map((sample) => {
      const sampleSet = sampleRoleSet(sample.roles)
      const overlapWeight = ROLES.reduce(
        (sum, role) => sum + (sampleSet.has(role.id) ? localCounts[role.id] : 0),
        0,
      )
      const overlapCount = [...localRoles].filter((roleId) => sampleSet.has(roleId)).length
      const weightedCoverage = overlapWeight / totalLocalWeight
      const roleCoverage = overlapCount / Math.max(1, localRoles.size)

      return [
        sample.title,
        {
          score: weightedCoverage * 0.65 + roleCoverage * 0.35,
          evidenceCount: evidence.length,
        },
      ]
    }),
  )
}

function topRoleSet(counts: Record<RoleId, number>, limit: number) {
  return new Set(
    ROLES.map((role) => role.id)
      .sort((a, b) => counts[b] - counts[a])
      .filter((roleId) => counts[roleId] > 0)
      .slice(0, limit),
  )
}

function calculateConfigurationSignal(records: PackRecord[], config: GameConfig): ConfigurationSignal {
  const ssrRecords = sortedSSRRecords(records)
  const observedSSR = calculateObservedSSRCounts(ssrRecords)
  const observedSSRTotal = Object.values(observedSSR).reduce((sum, value) => sum + value, 0)
  const activeRoleIds = ROLES.map((role) => role.id).filter((roleId) => observedSSR[roleId] > 0)
  const localScores = calculateLocalPositionMatchScores(records, config)

  if (observedSSRTotal < 8 || activeRoleIds.length < 4) {
    return {
      score: 0.15,
      label: '低',
      detail: '样本太少，暂时更接近盲选模型',
      suspectedRoleIds: activeRoleIds.slice(0, 6),
      matchedGroups: [],
    }
  }

  const duplicateExcess = Object.values(observedSSR).reduce(
    (sum, value) => sum + Math.max(0, value - 1),
    0,
  )
  const duplicateRatio = duplicateExcess / observedSSRTotal
  const sampleMatches = BOX_SAMPLES.map((sample) => {
    const set = sampleRoleSet(sample.roles)
    const counts = countsFromRoles(sample.roles)
    const roleIds = ROLES.map((role) => role.id).filter((roleId) => set.has(roleId))
    const overlap = activeRoleIds.filter((roleId) => set.has(roleId)).length
    const observedCoverage = overlap / Math.max(1, activeRoleIds.length)
    const sampleCoverage = overlap / Math.max(1, set.size)
    const local = localScores[sample.title]
    const localWeight = local && local.evidenceCount >= 4 ? 0.28 : 0
    const globalScore = observedCoverage * 0.7 + sampleCoverage * 0.3
    return {
      sample,
      overlap,
      roleIds,
      duplicateRoleIds: roleIds.filter((roleId) => counts[roleId] >= 2),
      observedRoleIds: roleIds.filter((roleId) => observedSSR[roleId] > 0),
      lowOrMissingRoleIds: roleIds.filter((roleId) => observedSSR[roleId] <= 1),
      localScore: local?.score,
      positionEvidenceCount: local?.evidenceCount,
      score: globalScore * (1 - localWeight) + (local?.score ?? globalScore) * localWeight,
    }
  }).sort((a, b) => b.score - a.score)

  const bestMatch = sampleMatches[0]
  const sampleMatchScore = bestMatch?.score ?? 0
  const sampleSizeFactor = clamp((observedSSRTotal - 6) / 34, 0.15, 1)
  const repeatedRoleCount = ROLES.filter((role) => observedSSR[role.id] >= 2).length
  const repeatStructureScore = clamp(duplicateRatio * 2.2 + repeatedRoleCount * 0.04, 0, 1)
  const score = clamp(
    (sampleMatchScore * 0.55 + repeatStructureScore * 0.45) * sampleSizeFactor,
    0,
    1,
  )
  const label: ConfigurationSignal['label'] = score >= 0.68 ? '高' : score >= 0.38 ? '中' : '低'
  const suspectedFromSample =
    bestMatch && bestMatch.score >= 0.35
      ? [...sampleRoleSet(bestMatch.sample.roles)]
      : []
  const suspectedRoleIds = ROLES.map((role) => role.id)
    .filter((roleId) => observedSSR[roleId] > 0 || suspectedFromSample.includes(roleId))
    .sort((a, b) => {
      const aScore =
        observedSSR[a] * 3 +
        (suspectedFromSample.includes(a) ? 1 : 0) +
        boxSampleStats.duplicateBoxes[a] * 0.5
      const bScore =
        observedSSR[b] * 3 +
        (suspectedFromSample.includes(b) ? 1 : 0) +
        boxSampleStats.duplicateBoxes[b] * 0.5
      return bScore - aScore
    })
    .slice(0, 9)

  const detail =
    label === '低'
      ? `配置感偏弱，当前更接近混池盲选；整盒样本最佳匹配为 ${bestMatch.sample.title}`
      : `配置感${label}，当前记录和 ${bestMatch.sample.title} 的角色组重合度最高`

  return {
    score,
    label,
    detail,
    matchedSampleTitle: bestMatch.sample.title,
    suspectedRoleIds,
    matchedGroups: sampleMatches.slice(0, 3).map((match) => ({
      title: match.sample.title,
      score: match.score,
      localScore: match.localScore,
      positionEvidenceCount: match.positionEvidenceCount,
      overlapCount: match.overlap,
      roleCount: match.roleIds.length,
      roleIds: match.roleIds,
      duplicateRoleIds: match.duplicateRoleIds,
      observedRoleIds: match.observedRoleIds,
      lowOrMissingRoleIds: match.lowOrMissingRoleIds,
    })),
  }
}

function detectDistributionShift(records: PackRecord[]) {
  const ssrRecords = sortedSSRRecords(records)
  if (ssrRecords.length < 45) {
    return { score: 0, label: '样本不足，未启用换池检测' }
  }

  const recent = ssrRecords.slice(-20)
  const previous = ssrRecords.slice(Math.max(0, ssrRecords.length - 60), -20)
  if (recent.length < 15 || previous.length < 20) {
    return { score: 0, label: '样本不足，未启用换池检测' }
  }

  const recentCounts = calculateObservedSSRCounts(recent)
  const previousCounts = calculateObservedSSRCounts(previous)
  const recentTop = topRoleSet(recentCounts, 6)
  const previousTop = topRoleSet(previousCounts, 6)
  const overlap = [...recentTop].filter((roleId) => previousTop.has(roleId)).length
  const overlapRatio = recentTop.size > 0 ? overlap / recentTop.size : 1
  const newClusterCount = ROLES.filter(
    (role) => recentCounts[role.id] >= 2 && previousCounts[role.id] <= 1,
  ).length

  let score = 0
  if (overlapRatio < 0.35) score = 1
  else if (overlapRatio < 0.55) score = 0.6
  if (newClusterCount >= 2) score = Math.max(score, 0.75)
  if (newClusterCount >= 3) score = Math.max(score, 1)

  if (score >= 0.9) return { score, label: '检测到明显分布切换，旧数据快速降权' }
  if (score >= 0.5) return { score, label: '检测到轻微分布切换，旧数据降权' }
  return { score, label: '未检测到明显分布切换' }
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

function hasVariantPair(records: PackRecord[], roleId: RoleId) {
  const variants = new Set(
    records
      .filter((record) => record.ssrRole === roleId)
      .map((record) => record.ssrVariant)
      .filter(Boolean),
  )
  return variants.has('gold') && variants.has('silver')
}

function calculateConfigurationRemainingSignal(
  records: PackRecord[],
  configuration: ConfigurationSignal,
) {
  const observedSSR = calculateObservedSSRCounts(records)
  const observedSSRTotal = Object.values(observedSSR).reduce((sum, value) => sum + value, 0)
  const matchedGroups = configuration.matchedGroups
  const groupScoreSum = matchedGroups.reduce((sum, group) => sum + Math.max(0.01, group.score), 0)
  const configShare = clamp(configuration.score * 0.78, 0, 0.82)
  const randomShare = 1 - configShare

  const result = Object.fromEntries(
    ROLES.map((role) => [
      role.id,
      {
        expectedShare: 1 / ROLES.length,
        observedShare: observedSSRTotal > 0 ? observedSSR[role.id] / observedSSRTotal : 0,
        gap: 0,
        duplicateSupport: 0,
        inGroupSupport: 0,
      },
    ]),
  ) as Record<
    RoleId,
    {
      expectedShare: number
      observedShare: number
      gap: number
      duplicateSupport: number
      inGroupSupport: number
    }
  >

  if (matchedGroups.length === 0 || groupScoreSum <= 0) return result

  for (const role of ROLES) {
    let expectedShare = randomShare / ROLES.length
    let duplicateSupport = 0
    let inGroupSupport = 0

    for (const group of matchedGroups) {
      const sample = BOX_SAMPLES.find((item) => item.title === group.title)
      if (!sample) continue

      const groupWeight = configShare * (Math.max(0.01, group.score) / groupScoreSum)
      const sampleCounts = countsFromRoles(sample.roles)
      const sampleTotal = Math.max(1, sample.roles.length)
      const localLift =
        group.localScore && group.positionEvidenceCount && group.positionEvidenceCount >= 4
          ? clamp(0.85 + group.localScore * 0.3, 0.85, 1.12)
          : 1

      expectedShare += groupWeight * localLift * (sampleCounts[role.id] / sampleTotal)
      if (sampleCounts[role.id] > 0) inGroupSupport += groupWeight
      if (sampleCounts[role.id] >= 2) duplicateSupport += groupWeight
    }

    result[role.id].expectedShare = expectedShare
    result[role.id].duplicateSupport = configShare > 0 ? duplicateSupport / configShare : 0
    result[role.id].inGroupSupport = configShare > 0 ? inGroupSupport / configShare : 0
    result[role.id].gap = expectedShare - result[role.id].observedShare
  }

  return result
}

export function calculateRoleScores(
  records: PackRecord[],
  config: GameConfig,
  qtr: QtrContinuity,
  configuration: ConfigurationSignal,
) {
  const observedSSR = calculateObservedSSRCounts(records)
  const recent10Counts = calculateWindowCounts(records, 10)
  const recent30Counts = calculateWindowCounts(records, 30)
  const shift = detectDistributionShift(records)
  const observedSSRTotal = Object.values(observedSSR).reduce((sum, value) => sum + value, 0)
  const activeRoleCount = Math.max(1, ROLES.filter((role) => observedSSR[role.id] > 0).length)
  const expectedPerActiveRole = observedSSRTotal / activeRoleCount
  const finitePoolFactor = clamp((observedSSRTotal - 35) / 65, 0, 1)
  const oldDataMultiplier = 1 - shift.score * 0.7
  const configScore = configuration.score
  const matchedSample = BOX_SAMPLES.find((sample) => sample.title === configuration.matchedSampleTitle)
  const matchedSampleRoles = matchedSample ? sampleRoleSet(matchedSample.roles) : new Set<RoleId>()
  const remainingSignal = calculateConfigurationRemainingSignal(records, configuration)
  const scores = emptyRoleMap(alpha)
  const reasons = Object.fromEntries(ROLES.map((role) => [role.id, [] as string[]])) as Record<
    RoleId,
    string[]
  >

  for (const role of ROLES) {
    const recent10 = recent10Counts[role.id]
    const recent30 = recent30Counts[role.id]
    const recent11To30 = Math.max(0, recent30 - recent10)
    const observedCount = observedSSR[role.id]
    const wholePoolScore = observedCount * (0.9 + configScore * 0.85)
    const recentActivityBonus = Math.min(1, recent10 * 0.16 + recent11To30 * 0.06)
    const streakBonus = recent30 >= 2 ? Math.min(0.45, recent30 * 0.08) : 0
    const pairBonus = hasVariantPair(records, role.id) ? 0.2 : 0
    const samplePresenceRate = boxSampleStats.presentBoxes[role.id] / boxSampleStats.boxCount
    const sampleDuplicateRate = boxSampleStats.duplicateBoxes[role.id] / boxSampleStats.boxCount
    const matchedSampleBonus =
      matchedSampleRoles.has(role.id) && observedSSRTotal >= 8 ? configScore * 0.35 : 0
    const sampleDuplicateBonus =
      observedCount > 0 && sampleDuplicateRate > 0
        ? configScore * Math.min(0.9, sampleDuplicateRate * 1.45)
        : 0
    const setPresenceBonus = observedCount > 0 ? configScore * 0.45 + finitePoolFactor * 0.25 : 0
    const oldPresenceBonus =
      observedCount > 0 && recent30 === 0 ? finitePoolFactor * oldDataMultiplier * 0.15 : 0
    const overdrawn = Math.max(0, observedCount - expectedPerActiveRole)
    const underdrawn = observedCount > 0 ? Math.max(0, expectedPerActiveRole - observedCount) : 0
    const priorProtected = sampleDuplicateRate >= 0.25 || matchedSampleRoles.has(role.id)
    const sustainedHot = overdrawn >= 1 && recent30 >= 2 && (recent10 >= 1 || priorProtected)
    const staleHot = overdrawn >= 1 && recent30 <= 1
    const depletionRate = sustainedHot || priorProtected ? 0.18 : staleHot ? 0.7 : 0.42
    const depletionPenalty = finitePoolFactor * Math.min(4.5, overdrawn * depletionRate)
    const sustainedHotBonus = sustainedHot ? configScore * Math.min(0.75, recent30 * 0.12) : 0
    const recentLowFrequency = observedCount > 0 && underdrawn > 0 && recent30 > 0
    const emergingRoleBonus =
      recentLowFrequency
        ? configScore * Math.min(1.4, underdrawn * 0.24 + recent10 * 0.16 + recent11To30 * 0.08)
        : 0
    const underdrawnBonus =
      observedCount > 0 && recent30 === 0 ? finitePoolFactor * Math.min(0.45, underdrawn * 0.08) : 0
    const remaining = remainingSignal[role.id]
    const remainingFactor = clamp((observedSSRTotal - 12) / 44, 0, 1) * configScore
    const positionEvidence =
      configuration.matchedGroups.some(
        (group) =>
          group.positionEvidenceCount &&
          group.positionEvidenceCount >= 4 &&
          group.roleIds.includes(role.id),
      )
    const remainingBonus =
      remaining.inGroupSupport > 0.15 && remaining.gap > 0
        ? remainingFactor * Math.min(1.25, remaining.gap * 18)
        : 0
    const remainingPenalty =
      observedCount > 0 && remaining.gap < -0.015
        ? remainingFactor *
          Math.min(1.35, Math.abs(remaining.gap) * 14) *
          (1 - remaining.duplicateSupport * 0.48)
        : 0
    const localPositionBonus =
      positionEvidence && remaining.inGroupSupport > 0.2 ? configScore * 0.16 : 0
    const modeMultiplier =
      config.mode === 'singleBoxSequential' && recent10 >= 2 ? 0.96 : 1

    const rawScore =
      Math.max(
        0.2,
        alpha +
          wholePoolScore +
          recentActivityBonus +
          setPresenceBonus +
          oldPresenceBonus +
          streakBonus +
          pairBonus +
          matchedSampleBonus +
          sampleDuplicateBonus +
          sustainedHotBonus +
          emergingRoleBonus +
          underdrawnBonus -
          remainingPenalty +
          remainingBonus +
          localPositionBonus -
          depletionPenalty,
      ) * modeMultiplier
    const blindScore = alpha + samplePresenceRate * 0.08
    const blendToBlind = 1 - configScore * 0.72
    scores[role.id] = rawScore * (1 - blendToBlind) + blindScore * blendToBlind

    if (observedCount > 0) reasons[role.id].push(`本次累计SSR ${observedCount}次`)
    if (recent10 > 0) reasons[role.id].push(`最近10包仍有${recent10}次，作为活跃修正`)
    if (recent11To30 > 0) reasons[role.id].push(`最近11-30包有${recent11To30}次`)
    if (recent30 >= 2) reasons[role.id].push(`本次窗口重复出现`)
    if (pairBonus > 0) reasons[role.id].push(`金银配对弱信号`)
    if (matchedSampleBonus > 0) reasons[role.id].push(`落在疑似配置组`)
    if (sampleDuplicateBonus > 0) reasons[role.id].push(`整盒样本中有复数卡位先验`)
    if (remainingBonus > 0.12) reasons[role.id].push('配置组余量偏高')
    if (remainingPenalty > 0.12) reasons[role.id].push('配置组已出偏多')
    if (localPositionBonus > 0) reasons[role.id].push('相近位置支持')
    if (finitePoolFactor > 0 && sustainedHot) reasons[role.id].push('累计偏高但近期仍活跃，保留热度')
    else if (finitePoolFactor > 0 && overdrawn >= 1) reasons[role.id].push('已抽出偏多，做消耗下修')
    if (finitePoolFactor > 0 && recentLowFrequency) reasons[role.id].push('低频入池且近期出现，剩余潜力上修')
    if (finitePoolFactor > 0 && underdrawn >= 1) reasons[role.id].push('已在池内且抽出偏少')
    if (shift.score > 0 && recent30 === 0 && observedCount > 0) reasons[role.id].push('疑似换池，旧窗口信号降权')
    if (qtr.score >= 1 && recent30 > 0) reasons[role.id].push(`QTR连续，近期记录可信度较高`)
    if (reasons[role.id].length === 0) reasons[role.id].push('主要来自均匀先验')
  }

  return { scores, reasons, shift }
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

function calculateConfidence(
  records: PackRecord[],
  qtr: QtrContinuity,
  configuration: ConfigurationSignal,
): CalculationResult['confidence'] {
  if (records.length < 20) return 'low'
  if (records.length >= 50 && qtr.score >= 0.75 && configuration.score >= 0.5) return 'high'
  return qtr.score < 0.75 ? 'low' : 'medium'
}

export function calculateProbabilities(records: PackRecord[], config: GameConfig): CalculationResult {
  const qtrContinuity = calculateQTRContinuity(records)
  const configuration = calculateConfigurationSignal(records, config)
  const { scores, reasons, shift } = calculateRoleScores(
    records,
    config,
    qtrContinuity,
    configuration,
  )
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
  if (configuration.score < 0.38) warnings.push('配置感偏弱，角色概率已向盲选回归。')
  if (qtrContinuity.score < 0.75) warnings.push('QTR信号疑似断层，旧数据权重已下降。')
  if (shift.score >= 0.5) warnings.push(shift.label)
  if (records.some((record) => record.urRole)) warnings.push('UR记录不参与SSR角色概率排序，仅作为高价值结果记录。')
  if (rows[0]?.pHit < 0.0519) warnings.push('Top1仍低于优于6.5元渠道价的大致阈值，仅建议娱乐观察。')

  return {
    rows,
    topRows: rows.slice(0, 6),
    blindHitRate,
    actualPrice,
    observedSSRSlotRate,
    qtrContinuity,
    configuration,
    confidence: calculateConfidence(records, qtrContinuity, configuration),
    warnings,
  }
}
