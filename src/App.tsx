import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { DEFAULT_RECORDS } from './data/defaultRecords'
import { ROLES } from './data/roles'
import { parseCsvRecords, recordsToCsv } from './lib/csv'
import {
  calculateAtLeastKHitProbability,
  calculateProbabilities,
} from './lib/probability'
import type { BasketLayoutMode, BasketSide, CardVariant, GameConfig, PackRecord, RoleId } from './types'

const STORAGE_KEY = 'card-pack-probability-helper:v1'
const pageSizeOptions = [10, 20, 50]

type SavedSession = {
  id: string
  title: string
  createdAt: string
  records: PackRecord[]
  config: GameConfig
  targetHitCount: number
}

const defaultConfig: GameConfig = {
  packPrice: 11.9,
  couponDiscount: 0,
  plannedPackCount: 10,
  rewardBoxPacks: 16,
  pSSRSlot: 15 / 16,
  channelCostTarget: 6.5,
  mode: 'mixedBasket',
  basketLayoutMode: 'twoColumns',
  erPosition: 'unknown',
  initialPoolPacks: '',
  observedErCount: '',
  mixedCaseCount: '',
  priorPackCount: '',
  priorHitCount: '',
  priorSpend: '',
  customBuyCount: '',
}

const blankRecord = (sequence: number, orderId: number): PackRecord => ({
  id: crypto.randomUUID(),
  sequence,
  orderId,
  side: '',
  sidePosition: '',
  ssrRole: '',
  ssrVariant: '',
  urRole: '',
  qtrId: '',
  erHit: false,
  spHit: false,
  leftTotalBefore: '',
  rightTotalBefore: '',
  rowTotalBefore: '',
  note: '',
})

function percent(value: number) {
  return `${(value * 100).toFixed(2)}%`
}

function money(value: number) {
  return `¥${value.toFixed(2)}`
}

function numericConfigValue(value: number | '' | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function erDensityLabel(erCount: number, poolPacks?: number) {
  if (!poolPacks || erCount <= 0) return '-'
  return `约 ${Math.round(poolPacks / erCount)} 包/张`
}

function erDensityLevel(erCount: number, poolPacks?: number) {
  if (!poolPacks || erCount <= 0) return 'unknown'
  const packsPerEr = poolPacks / erCount
  if (packsPerEr <= 40) return 'high'
  if (packsPerEr <= 80) return 'normal'
  return 'low'
}

function roleLabel(roleId?: RoleId | '') {
  if (!roleId) return ''
  const role = ROLES.find((item) => item.id === roleId)
  return role ? `${role.id} ${role.name}` : roleId
}

function readInitialState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return {
        config: defaultConfig,
        records: DEFAULT_RECORDS,
        targetHitCount: 1,
        pageSize: 10,
        histories: [] as SavedSession[],
      }
    }
    const parsed = JSON.parse(raw) as {
      config?: GameConfig
      records?: PackRecord[]
      targetHitCount?: number
      pageSize?: number
      histories?: SavedSession[]
    }
    return {
      config: { ...defaultConfig, ...parsed.config },
      records: parsed.records?.length ? parsed.records : DEFAULT_RECORDS,
      targetHitCount: parsed.targetHitCount ?? 1,
      pageSize: pageSizeOptions.includes(parsed.pageSize ?? 10) ? (parsed.pageSize ?? 10) : 10,
      histories: parsed.histories ?? [],
    }
  } catch {
    return {
      config: defaultConfig,
      records: DEFAULT_RECORDS,
      targetHitCount: 1,
      pageSize: 10,
      histories: [] as SavedSession[],
    }
  }
}

function App() {
  const initialState = useMemo(() => readInitialState(), [])
  const [config, setConfig] = useState<GameConfig>(initialState.config)
  const [records, setRecords] = useState<PackRecord[]>(initialState.records)
  const [targetHitCount, setTargetHitCount] = useState(initialState.targetHitCount)
  const [pageSize, setPageSize] = useState(initialState.pageSize)
  const [currentPage, setCurrentPage] = useState(1)
  const [histories, setHistories] = useState<SavedSession[]>(initialState.histories)
  const [csvText, setCsvText] = useState('')

  const result = useMemo(() => calculateProbabilities(records, config), [records, config])
  const displayRecords = useMemo(
    () => [...records].sort((a, b) => b.sequence - a.sequence),
    [records],
  )
  const pageCount = Math.max(1, Math.ceil(displayRecords.length / pageSize))
  const safeCurrentPage = Math.min(currentPage, pageCount)
  const pagedRecords = displayRecords.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize,
  )
  const nextSequence = useMemo(
    () => Math.max(0, ...records.map((record) => record.sequence)) + 1,
    [records],
  )
  const currentOrderId = useMemo(
    () => Math.max(0, ...records.map((record) => record.orderId ?? record.sequence)),
    [records],
  )

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ config, records, targetHitCount, pageSize, histories }),
    )
  }, [config, records, targetHitCount, pageSize, histories])

  function updateConfig<Key extends keyof GameConfig>(key: Key, value: GameConfig[Key]) {
    setConfig((current) => ({ ...current, [key]: value }))
  }

  function updateRecord(id: string, patch: Partial<PackRecord>) {
    setRecords((current) =>
      current.map((record) => (record.id === id ? { ...record, ...patch } : record)),
    )
  }

  function addOrder() {
    setRecords((current) => {
      const sequence = Math.max(0, ...current.map((record) => record.sequence)) + 1
      const orderId = Math.max(0, ...current.map((record) => record.orderId ?? record.sequence)) + 1
      return [blankRecord(sequence, orderId), ...current]
    })
    setCurrentPage(1)
  }

  function addRecordsToCurrentOrder(count: number) {
    setRecords((current) => {
      const start = Math.max(0, ...current.map((record) => record.sequence)) + 1
      const orderId = Math.max(1, ...current.map((record) => record.orderId ?? record.sequence))
      const newRows = Array.from({ length: count }, (_, index) => blankRecord(start + index, orderId))
      return [...newRows, ...current]
    })
    setCurrentPage(1)
  }

  function removeRecord(id: string) {
    setRecords((current) => current.filter((record) => record.id !== id))
  }

  function resetDemo() {
    setRecords(DEFAULT_RECORDS)
    setCurrentPage(1)
  }

  function clearRecords() {
    setRecords([])
    setCurrentPage(1)
  }

  function importCsv() {
    const parsed = parseCsvRecords(csvText, nextSequence)
    if (parsed.length === 0) return
    setRecords((current) => [...current, ...parsed].sort((a, b) => a.sequence - b.sequence))
    setCurrentPage(1)
    setCsvText('')
  }

  function exportCsv() {
    const blob = new Blob([recordsToCsv(records)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'pack-records.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  function saveCurrentSession() {
    const now = new Date()
    const title = `${now.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })} · ${records.length}包`
    const session: SavedSession = {
      id: crypto.randomUUID(),
      title,
      createdAt: now.toISOString(),
      records,
      config,
      targetHitCount,
    }
    setHistories((current) => [session, ...current])
  }

  function loadSession(session: SavedSession) {
    setRecords(session.records)
    setConfig({ ...defaultConfig, ...session.config })
    setTargetHitCount(session.targetHitCount)
    setCurrentPage(1)
  }

  function deleteSession(id: string) {
    setHistories((current) => current.filter((session) => session.id !== id))
  }

  const top = result.topRows[0]
  const customBuyCount = Math.floor(numericConfigValue(config.customBuyCount))
  const buyCounts = [...new Set([1, 3, 5, 7, 10, 15, 17, 20, 24, 30, customBuyCount])]
    .filter((count) => count > 0)
    .sort((a, b) => a - b)
  const priorPackCount = numericConfigValue(config.priorPackCount)
  const priorHitCount = numericConfigValue(config.priorHitCount)
  const priorSpend =
    typeof config.priorSpend === 'number'
      ? config.priorSpend
      : priorPackCount * result.actualPrice
  const priorRewardPacks = priorHitCount * config.rewardBoxPacks
  const priorEffectivePacks = priorPackCount + priorRewardPacks
  const currentActualCost =
    priorEffectivePacks > 0 ? priorSpend / priorEffectivePacks : undefined
  const ssrTotal = records.filter((record) => record.ssrRole).length
  const recordedErCount = records.filter((record) => record.erHit).length
  const knownErCount =
    typeof config.observedErCount === 'number' ? config.observedErCount : 0
  const estimatedRemainingPacks =
    typeof config.initialPoolPacks === 'number'
      ? Math.max(0, config.initialPoolPacks - records.length)
      : undefined
  const expectedInitialErCount =
    typeof config.mixedCaseCount === 'number'
      ? (config.mixedCaseCount * 24 * 16) / 64
      : typeof config.initialPoolPacks === 'number'
        ? config.initialPoolPacks / 64
        : undefined
  const estimatedRemainingErCount =
    expectedInitialErCount === undefined
      ? undefined
      : Math.max(0, expectedInitialErCount - knownErCount - recordedErCount)
  const erDensity =
    estimatedRemainingPacks && estimatedRemainingErCount !== undefined
      ? estimatedRemainingErCount / estimatedRemainingPacks
      : undefined
  const erDensityTone =
    estimatedRemainingPacks && estimatedRemainingErCount !== undefined
      ? erDensityLevel(estimatedRemainingErCount, estimatedRemainingPacks)
      : 'unknown'
  const maxRoleCount = Math.max(
    1,
    ...ROLES.map((role) => records.filter((record) => record.ssrRole === role.id).length),
  )
  const sideGroups = [
    {
      side: 'left' as const,
      label: config.basketLayoutMode === 'singleRow' ? '从左数' : '左侧',
      shortLabel: config.basketLayoutMode === 'singleRow' ? '从左数' : '左',
    },
    {
      side: 'right' as const,
      label: config.basketLayoutMode === 'singleRow' ? '从右数' : '右侧',
      shortLabel: config.basketLayoutMode === 'singleRow' ? '从右数' : '右',
    },
  ]
  const isSingleRowLayout = config.basketLayoutMode === 'singleRow'
  const recordTableColSpan = isSingleRowLayout ? 13 : 14

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">卡包直播间刺盒下注概率助手</p>
          <h1>实时记录开包，估算下一轮角色优势</h1>
        </div>
        <div className="status-strip" aria-label="当前模型摘要">
          <span>记录 {records.length} 包</span>
          <span>置信度 {result.confidence === 'low' ? '低' : result.confidence === 'medium' ? '中' : '高'}</span>
          <span>配置感 {result.configuration.label}</span>
          <span>QTR {result.qtrContinuity.label}</span>
        </div>
      </header>

      <section className="workbench">
        <aside className="settings-panel">
          <section className="side-card">
            <div className="section-heading compact-heading">
              <div>
                <h2>本次SSR角色占比</h2>
                <p>基于当前输入框全部记录，共 {ssrTotal} 张SSR。</p>
              </div>
            </div>
            <div className="frequency-list">
              {ROLES.map((role) => {
                const count = records.filter((record) => record.ssrRole === role.id).length
                const share = ssrTotal > 0 ? count / ssrTotal : 0
                return (
                  <div className="frequency-row" key={role.id}>
                    <span>{role.id}</span>
                    <b>{role.name}</b>
                    <div className="bar"><i style={{ width: `${(count / maxRoleCount) * 100}%` }} /></div>
                    <em>{percent(share)}</em>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="pool-info-card">
            <div className="section-heading compact-heading">
              <div>
                <h2>本次混池信息</h2>
                <p>用于后续判断余量、补池和ER浓度。</p>
              </div>
            </div>
            <div className="pool-info-grid">
              <label>
                框位模式
                <select
                  value={config.basketLayoutMode}
                  onChange={(event) =>
                    updateConfig('basketLayoutMode', event.target.value as BasketLayoutMode)
                  }
                >
                  <option value="twoColumns">左右双列</option>
                  <option value="singleRow">单横排</option>
                </select>
              </label>
              <label>
                起始余量
                <input
                  type="number"
                  min="0"
                  value={config.initialPoolPacks ?? ''}
                  onChange={(event) =>
                    updateConfig('initialPoolPacks', event.target.value ? Number(event.target.value) : '')
                  }
                  placeholder="如 100"
                />
              </label>
              <label>
                已出ER(本次前)
                <input
                  type="number"
                  min="0"
                  value={config.observedErCount ?? ''}
                  onChange={(event) =>
                    updateConfig('observedErCount', event.target.value ? Number(event.target.value) : '')
                  }
                  placeholder={`${recordedErCount}`}
                />
              </label>
              <label>
                几箱混
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={config.mixedCaseCount ?? ''}
                  onChange={(event) =>
                    updateConfig('mixedCaseCount', event.target.value ? Number(event.target.value) : '')
                  }
                  placeholder="如 1.5"
                />
              </label>
            </div>
            <div className="pool-derived">
              <span>估算剩余：{estimatedRemainingPacks === undefined ? '-' : `${estimatedRemainingPacks}包`}</span>
              <span className={`er-density er-density-${erDensityTone}`}>
                剩余ER浓度：{erDensity === undefined ? '-' : erDensityLabel(estimatedRemainingErCount ?? 0, estimatedRemainingPacks)}
              </span>
              <span>剩余ER估计：{estimatedRemainingErCount === undefined ? '-' : estimatedRemainingErCount.toFixed(1)}</span>
              <span>记录内ER：{recordedErCount}</span>
            </div>
          </section>

          <details className="settings-details">
            <summary>
              <span>参数设置</span>
              <small>单包价、SSR槽概率、模式等</small>
            </summary>
            <div className="form-grid">
              <label>
                单包价格
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={config.packPrice}
                  onChange={(event) => updateConfig('packPrice', Number(event.target.value))}
                />
              </label>
              <label>
                优惠券抵扣
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={config.couponDiscount}
                  onChange={(event) => updateConfig('couponDiscount', Number(event.target.value))}
                />
              </label>
              <label>
                准备下单包数
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={config.plannedPackCount}
                  onChange={(event) => updateConfig('plannedPackCount', Number(event.target.value))}
                />
              </label>
              <label>
                奖励盒包数
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={config.rewardBoxPacks}
                  onChange={(event) => updateConfig('rewardBoxPacks', Number(event.target.value))}
                />
              </label>
              <label>
                SSR槽概率
                <select
                  value={String(config.pSSRSlot)}
                  onChange={(event) => updateConfig('pSSRSlot', Number(event.target.value))}
                >
                  <option value={String(15 / 16)}>15/16 = 93.75%</option>
                  <option value="0.9216">官方约 92.16%</option>
                </select>
              </label>
              <label>
                渠道价目标
                <select
                  value={String(config.channelCostTarget)}
                  onChange={(event) => updateConfig('channelCostTarget', Number(event.target.value))}
                >
                  <option value="6.5">¥6.50</option>
                  <option value="6">¥6.00</option>
                </select>
              </label>
              <label>
                模式
                <select
                  value={config.mode}
                  onChange={(event) =>
                    updateConfig('mode', event.target.value as GameConfig['mode'])
                  }
                >
                  <option value="mixedBasket">混池模式</option>
                  <option value="singleBoxSequential">单盒连续模式</option>
                </select>
              </label>
              <label>
                ER位置假设
                <select
                  value={config.erPosition}
                  onChange={(event) =>
                    updateConfig('erPosition', event.target.value as GameConfig['erPosition'])
                  }
                >
                  <option value="unknown">不确定</option>
                  <option value="thinSlot">薄卡位</option>
                  <option value="thickSlot">厚卡位</option>
                </select>
              </label>
            </div>
          </details>

          <div className="notice-list">
            {result.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
            <p>SP / ER 是高价值上行结果；它们可能不刺中目标SSR，但不代表结果差。</p>
          </div>

          <div className="history-panel">
            <div className="history-heading">
              <div>
                <h2>历史记录</h2>
                <p>保存当前这一轮录入，之后可以载入对比。</p>
              </div>
              <button type="button" onClick={saveCurrentSession}>保存本次</button>
            </div>
            <div className="history-list">
              {histories.map((session) => (
                <article className="history-item" key={session.id}>
                  <button type="button" onClick={() => loadSession(session)}>
                    <strong>{session.title}</strong>
                    <span>{session.records.length} 包 · {new Date(session.createdAt).toLocaleDateString('zh-CN')}</span>
                  </button>
                  <button
                    type="button"
                    className="icon-button danger"
                    onClick={() => deleteSession(session.id)}
                    aria-label="删除历史记录"
                  >
                    ×
                  </button>
                </article>
              ))}
              {histories.length === 0 && <p className="empty-history">暂无保存的历史记录。</p>}
            </div>
          </div>
        </aside>

        <section className="records-panel">
          <div className="section-heading">
            <div>
              <h2>连续录入</h2>
              <p>一行是一包；默认新增一单，如一单多包就用“本单+N”。当前单号 {currentOrderId || 1}。</p>
              <p className="layout-hint">
                {isSingleRowLayout
                  ? '当前是单横排：左/右代表从哪边开始数，同一排共享序号。'
                  : '当前是左右双列：左/右是两条独立队列。'}
              </p>
            </div>
            <div className="button-row">
              <button type="button" onClick={addOrder}>新增一单</button>
              <button type="button" onClick={() => addRecordsToCurrentOrder(1)}>本单+1</button>
              <button type="button" onClick={() => addRecordsToCurrentOrder(3)}>本单+3</button>
              <button type="button" onClick={() => addRecordsToCurrentOrder(5)}>本单+5</button>
              <button type="button" onClick={() => addRecordsToCurrentOrder(10)}>本单+10</button>
              <button type="button" onClick={saveCurrentSession}>保存本次</button>
              <button type="button" onClick={exportCsv}>导出CSV</button>
              <button type="button" onClick={resetDemo}>载入示例</button>
              <button type="button" className="danger" onClick={clearRecords}>清空</button>
            </div>
          </div>

          <div className="pagination-bar">
            <label className="inline-control">
              每页
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value))
                  setCurrentPage(1)
                }}
              >
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>{option}行</option>
                ))}
              </select>
            </label>
            <div className="page-controls">
              <button
                type="button"
                onClick={() => setCurrentPage(Math.max(1, safeCurrentPage - 1))}
                disabled={safeCurrentPage <= 1}
              >
                上一页
              </button>
              <span>第 {safeCurrentPage} / {pageCount} 页 · 共 {records.length} 包</span>
              <button
                type="button"
                onClick={() => setCurrentPage(Math.min(pageCount, safeCurrentPage + 1))}
                disabled={safeCurrentPage >= pageCount}
              >
                下一页
              </button>
            </div>
          </div>

          <div className="table-wrap record-table">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>单号</th>
                  <th>SSR角色</th>
                  <th>{isSingleRowLayout ? '数向' : '边'}</th>
                  <th>{isSingleRowLayout ? '排位' : '侧位'}</th>
                  <th>序号</th>
                  <th>金/银</th>
                  <th>UR角色</th>
                  <th>QTR</th>
                  <th>ER</th>
                  <th>SP</th>
                  {isSingleRowLayout ? (
                    <th>整排抽前总</th>
                  ) : (
                    <>
                      <th>左抽前总</th>
                      <th>右抽前总</th>
                    </>
                  )}
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                {pagedRecords.map((record) => (
                  <tr className={!record.ssrRole ? 'pending-row' : undefined} key={record.id}>
                    <td>
                      <button type="button" className="icon-button" onClick={() => removeRecord(record.id)} aria-label="删除">
                        ×
                      </button>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={record.orderId ?? record.sequence}
                        onChange={(event) =>
                          updateRecord(record.id, { orderId: Number(event.target.value) || undefined })
                        }
                      />
                    </td>
                    <td>
                      <select
                        value={record.ssrRole}
                        onChange={(event) =>
                          updateRecord(record.id, { ssrRole: event.target.value as RoleId | '' })
                        }
                      >
                        <option value="">无/未见</option>
                        {ROLES.map((role) => (
                          <option key={role.id} value={role.id}>{roleLabel(role.id)}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={record.side ?? ''}
                        onChange={(event) =>
                          updateRecord(record.id, { side: event.target.value as BasketSide })
                        }
                      >
                        <option value="">未记</option>
                        <option value="left">{isSingleRowLayout ? '从左数' : '左'}</option>
                        <option value="right">{isSingleRowLayout ? '从右数' : '右'}</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={record.sidePosition ?? ''}
                        onChange={(event) =>
                          updateRecord(record.id, {
                            sidePosition: event.target.value ? Number(event.target.value) : '',
                          })
                        }
                        placeholder={isSingleRowLayout ? '第几包' : '几'}
                      />
                    </td>
                    <td className="readonly-cell">
                      #{record.sequence}
                    </td>
                    <td>
                      <select
                        value={record.ssrVariant}
                        onChange={(event) =>
                          updateRecord(record.id, { ssrVariant: event.target.value as CardVariant })
                        }
                      >
                        <option value="">未记</option>
                        <option value="silver">银</option>
                        <option value="gold">金</option>
                        <option value="unknown">不确定</option>
                      </select>
                    </td>
                    <td>
                      <select
                        value={record.urRole}
                        onChange={(event) =>
                          updateRecord(record.id, { urRole: event.target.value as RoleId | '' })
                        }
                      >
                        <option value="">无</option>
                        {ROLES.map((role) => (
                          <option key={role.id} value={role.id}>{roleLabel(role.id)}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={record.qtrId}
                        onChange={(event) => updateRecord(record.id, { qtrId: event.target.value })}
                      >
                        <option value="">无</option>
                        {Array.from({ length: 10 }, (_, index) => `QTR-${index + 1}`).map((qtr) => (
                          <option key={qtr} value={qtr}>{qtr}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={record.erHit}
                        onChange={(event) => updateRecord(record.id, { erHit: event.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={record.spHit}
                        onChange={(event) => updateRecord(record.id, { spHit: event.target.checked })}
                      />
                    </td>
                    {isSingleRowLayout ? (
                      <td className="total-cell">
                        <input
                          type="number"
                          min="0"
                          value={record.rowTotalBefore ?? ''}
                          onChange={(event) =>
                            updateRecord(record.id, {
                              rowTotalBefore: event.target.value ? Number(event.target.value) : '',
                            })
                          }
                        />
                      </td>
                    ) : (
                      <>
                        <td className="total-cell">
                          <input
                            type="number"
                            min="0"
                            value={record.leftTotalBefore ?? ''}
                            onChange={(event) =>
                              updateRecord(record.id, {
                                leftTotalBefore: event.target.value ? Number(event.target.value) : '',
                              })
                            }
                          />
                        </td>
                        <td className="total-cell">
                          <input
                            type="number"
                            min="0"
                            value={record.rightTotalBefore ?? ''}
                            onChange={(event) =>
                              updateRecord(record.id, {
                                rightTotalBefore: event.target.value ? Number(event.target.value) : '',
                              })
                            }
                          />
                        </td>
                      </>
                    )}
                    <td className="note-cell">
                      <input
                        type="text"
                        value={record.note}
                        onChange={(event) => updateRecord(record.id, { note: event.target.value })}
                        placeholder="可记直播间线索"
                      />
                    </td>
                  </tr>
                ))}
                {records.length === 0 && (
                  <tr>
                    <td colSpan={recordTableColSpan} className="empty-cell">暂无记录，点“新增一单”开始录入。</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="csv-box">
            <textarea
              value={csvText}
              onChange={(event) => setCsvText(event.target.value)}
              placeholder="可粘贴CSV：sequence,orderId,side,sidePosition,ssrRole,ssrVariant,urRole,qtrId,erHit,spHit,leftTotalBefore,rightTotalBefore,rowTotalBefore,note"
            />
            <button type="button" onClick={importCsv}>导入粘贴内容</button>
          </div>
        </section>
      </section>

      <section className="results-grid">
        <section className="top-panel">
          <div className="section-heading">
            <div>
              <h2>Top候选</h2>
              <p>{result.configuration.detail}；{result.qtrContinuity.detail}</p>
            </div>
          </div>
          <div className="configuration-summary">
            <span>配置置信度 {percent(result.configuration.score)}</span>
            <span>
              疑似角色组：
              {result.configuration.suspectedRoleIds.length > 0
                ? result.configuration.suspectedRoleIds.map((roleId) => roleLabel(roleId)).join('、')
                : '-'}
            </span>
          </div>
          <div className="top-list">
            {result.topRows.map((row) => (
              <article key={row.role.id} className="top-item">
                <span>Top {row.rank}</span>
                <strong>{roleLabel(row.role.id)}</strong>
                <div className="top-stats">
                  <b>{percent(row.pHit)}</b>
                  <small>有效命中率 · {row.level}</small>
                </div>
                <p>{row.reasons.join('，')}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="buy-panel">
          <div className="section-heading">
            <div>
              <h2>建议购买包数概率</h2>
              <p>按当前Top1角色估算至少中指定盒数的概率。</p>
            </div>
            <label className="inline-control">
              至少中
              <input
                type="number"
                min="1"
                step="1"
                value={targetHitCount}
                onChange={(event) => setTargetHitCount(Number(event.target.value) || 1)}
              />
              盒
            </label>
          </div>
          <div className="buy-context-grid">
            <label>
              试算包数
              <input
                type="number"
                min="1"
                step="1"
                value={config.customBuyCount ?? ''}
                onChange={(event) =>
                  updateConfig('customBuyCount', event.target.value ? Number(event.target.value) : '')
                }
                placeholder="如 7"
              />
            </label>
            <label>
              已买包数
              <input
                type="number"
                min="0"
                step="1"
                value={config.priorPackCount ?? ''}
                onChange={(event) =>
                  updateConfig('priorPackCount', event.target.value ? Number(event.target.value) : '')
                }
                placeholder="如 17"
              />
            </label>
            <label>
              已中盒数
              <input
                type="number"
                min="0"
                step="1"
                value={config.priorHitCount ?? ''}
                onChange={(event) =>
                  updateConfig('priorHitCount', event.target.value ? Number(event.target.value) : '')
                }
                placeholder="如 0"
              />
            </label>
            <label>
              已花金额
              <input
                type="number"
                min="0"
                step="0.1"
                value={config.priorSpend ?? ''}
                onChange={(event) =>
                  updateConfig('priorSpend', event.target.value ? Number(event.target.value) : '')
                }
                placeholder="不填则估算"
              />
            </label>
          </div>
          <div className="buy-summary">
            <span>当前实付：{priorPackCount > 0 ? money(priorSpend) : '-'}</span>
            <span>当前成本：{currentActualCost === undefined ? '-' : `${money(currentActualCost)}/包`}</span>
            <span>目标价：{money(config.channelCostTarget)}/包</span>
          </div>
          <div className="buy-grid">
            {buyCounts.map((count) => {
              const p = top
                ? calculateAtLeastKHitProbability(top.pHit, count, targetHitCount)
                : 0
              const totalSpend = priorSpend + count * result.actualPrice
              const noHitEffectivePacks = priorEffectivePacks + count
              const hitEffectivePacks =
                priorEffectivePacks + count + targetHitCount * config.rewardBoxPacks
              const noHitCost =
                noHitEffectivePacks > 0 ? totalSpend / noHitEffectivePacks : undefined
              const hitCost = hitEffectivePacks > 0 ? totalSpend / hitEffectivePacks : undefined
              return (
                <div className="buy-row" key={count}>
                  <span>买 {count} 包</span>
                  <strong>{percent(p)}</strong>
                  <em className={noHitCost && noHitCost <= config.channelCostTarget ? 'positive' : ''}>
                    未中 {noHitCost === undefined ? '-' : money(noHitCost)}
                  </em>
                  <em className={hitCost && hitCost <= config.channelCostTarget ? 'positive' : ''}>
                    中后 {hitCost === undefined ? '-' : money(hitCost)}
                  </em>
                  <div className="bar"><i style={{ width: `${Math.min(100, p * 100)}%` }} /></div>
                </div>
              )
            })}
          </div>
        </section>
      </section>

      <section className="probability-panel">
        <div className="side-frequency-grid">
          {sideGroups.map(({ side, label, shortLabel }) => {
            const sideSsrTotal = records.filter(
              (record) => record.side === side && record.ssrRole,
            ).length
            const maxSideRoleCount = Math.max(
              1,
              ...ROLES.map(
                (role) =>
                  records.filter((record) => record.side === side && record.ssrRole === role.id)
                    .length,
              ),
            )

            return (
              <section className="side-frequency-card" key={side}>
                <div className="section-heading compact-heading">
                  <div>
                    <h2>{label}SSR角色占比</h2>
                    <p>只统计已填写“{shortLabel}”的记录，共 {sideSsrTotal} 张SSR。</p>
                  </div>
                </div>
                <div className="frequency-list compact-frequency-list">
                  {ROLES.map((role) => {
                    const count = records.filter(
                      (record) => record.side === side && record.ssrRole === role.id,
                    ).length
                    const share = sideSsrTotal > 0 ? count / sideSsrTotal : 0
                    return (
                      <div className="frequency-row" key={role.id}>
                        <span>{role.id}</span>
                        <b>{role.name}</b>
                        <div className="bar"><i style={{ width: `${(count / maxSideRoleCount) * 100}%` }} /></div>
                        <em>{percent(share)}</em>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>

        <div className="section-heading">
          <div>
            <h2>全部角色概率表</h2>
            <p>
              观测SSR槽率 {percent(result.observedSSRSlotRate)}，模型使用SSR槽率 {percent(config.pSSRSlot)}。
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>排名</th>
                <th>角色</th>
                <th>P(role|SSR)</th>
                <th>有效命中率</th>
                <th>{config.plannedPackCount}包至少中1盒</th>
                <th>期望成本/包</th>
                <th>提升</th>
                <th>建议</th>
                <th>理由</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.role.id}>
                  <td>{row.rank}</td>
                  <td><strong>{roleLabel(row.role.id)}</strong></td>
                  <td>{percent(row.pRoleGivenSSR)}</td>
                  <td>{percent(row.pHit)}</td>
                  <td>{percent(row.atLeastOneHit)}</td>
                  <td className={row.expectedCost <= config.channelCostTarget ? 'positive' : ''}>
                    {money(row.expectedCost)}
                  </td>
                  <td>{row.liftVsBlind.toFixed(2)}x</td>
                  <td><span className={`level level-${row.level}`}>{row.level}</span></td>
                  <td>{row.reasons.join('，')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer>
        这是直播观察辅助工具，不是官方概率或收益承诺。记录越完整，模型越有参考价值。
      </footer>
    </main>
  )
}

export default App
