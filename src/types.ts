export type RoleId =
  | '01'
  | '02'
  | '03'
  | '04'
  | '05'
  | '06'
  | '07'
  | '08'
  | '09'
  | '10'
  | '11'
  | '12'
  | '13'
  | '14'
  | '15'
  | '16'
  | '17'
  | '18'
  | '19'

export type CardVariant = '' | 'gold' | 'silver' | 'unknown'
export type BasketSide = '' | 'left' | 'right'
export type BasketLayoutMode = 'twoColumns' | 'singleRow'

export type PackRecord = {
  id: string
  sequence: number
  orderId?: number
  side?: BasketSide
  sidePosition?: number | ''
  ssrRole?: RoleId | ''
  ssrVariant?: CardVariant
  urRole?: RoleId | ''
  qtrId?: string
  erHit: boolean
  spHit: boolean
  leftTotalBefore?: number | ''
  rightTotalBefore?: number | ''
  rowTotalBefore?: number | ''
  note?: string
}

export type GameConfig = {
  packPrice: number
  couponDiscount: number
  plannedPackCount: number
  rewardBoxPacks: number
  pSSRSlot: number
  channelCostTarget: number
  mode: 'mixedBasket' | 'singleBoxSequential'
  basketLayoutMode: BasketLayoutMode
  erPosition: 'thinSlot' | 'thickSlot' | 'unknown'
  initialPoolPacks?: number | ''
  observedErCount?: number | ''
  mixedCaseCount?: number | ''
  priorPackCount?: number | ''
  priorHitCount?: number | ''
  priorSpend?: number | ''
  customBuyCount?: number | ''
}

export type RoleInfo = {
  id: RoleId
  name: string
}

export type QtrContinuity = {
  score: number
  label: '连续' | '不确定' | '疑似换池'
  detail: string
}

export type ConfigurationSignal = {
  score: number
  label: '低' | '中' | '高'
  detail: string
  matchedSampleTitle?: string
  suspectedRoleIds: RoleId[]
  matchedGroups: Array<{
    title: string
    score: number
    localScore?: number
    positionEvidenceCount?: number
    overlapCount: number
    roleCount: number
    roleIds: RoleId[]
    duplicateRoleIds: RoleId[]
    observedRoleIds: RoleId[]
    lowOrMissingRoleIds: RoleId[]
  }>
}

export type RoleProbability = {
  role: RoleInfo
  rank: number
  score: number
  pRoleGivenSSR: number
  pHit: number
  expectedCost: number
  atLeastOneHit: number
  liftVsBlind: number
  level: '观望' | '小注' | '可考虑' | '优势明显' | '强信号'
  reasons: string[]
}

export type CalculationResult = {
  rows: RoleProbability[]
  topRows: RoleProbability[]
  blindHitRate: number
  actualPrice: number
  observedSSRSlotRate: number
  qtrContinuity: QtrContinuity
  configuration: ConfigurationSignal
  confidence: 'low' | 'medium' | 'high'
  warnings: string[]
}
