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

export type PackRecord = {
  id: string
  sequence: number
  ssrRole?: RoleId | ''
  ssrVariant?: CardVariant
  urRole?: RoleId | ''
  qtrId?: string
  erHit: boolean
  spHit: boolean
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
  erPosition: 'thinSlot' | 'thickSlot' | 'unknown'
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
  confidence: 'low' | 'medium' | 'high'
  warnings: string[]
}
