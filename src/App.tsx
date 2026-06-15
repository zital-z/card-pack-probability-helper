import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { DEFAULT_RECORDS } from './data/defaultRecords'
import { ROLES } from './data/roles'
import { parseCsvRecords, recordsToCsv } from './lib/csv'
import {
  calculateAtLeastKHitProbability,
  calculateProbabilities,
} from './lib/probability'
import type { CardVariant, GameConfig, PackRecord, RoleId } from './types'

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
  erPosition: 'unknown',
}

const blankRecord = (sequence: number): PackRecord => ({
  id: crypto.randomUUID(),
  sequence,
  ssrRole: '',
  ssrVariant: '',
  urRole: '',
  qtrId: '',
  erHit: false,
  spHit: false,
  note: '',
})

function percent(value: number) {
  return `${(value * 100).toFixed(2)}%`
}

function money(value: number) {
  return `¥${value.toFixed(2)}`
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

  function addRecord() {
    setRecords((current) => [blankRecord(nextSequence), ...current])
    setCurrentPage(1)
  }

  function addRecords(count: number) {
    setRecords((current) => {
      const start = Math.max(0, ...current.map((record) => record.sequence)) + 1
      const newRows = Array.from({ length: count }, (_, index) => blankRecord(start + index))
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
  const top2 = result.topRows[1]
  const buyCounts = [1, 3, 5, 10, 15, 20, 30]
  const topAtLeastTwoHits = top
    ? calculateAtLeastKHitProbability(top.pHit, config.plannedPackCount, 2)
    : 0

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
          <span>QTR {result.qtrContinuity.label}</span>
        </div>
      </header>

      <section className="summary-grid">
        <div className="metric">
          <span>Top1</span>
          <strong>{top ? roleLabel(top.role.id) : '-'}</strong>
          <small>{top ? `有效命中率 ${percent(top.pHit)}` : '暂无记录'}</small>
        </div>
        <div className="metric">
          <span>Top2</span>
          <strong>{top2 ? roleLabel(top2.role.id) : '-'}</strong>
          <small>{top2 ? `有效命中率 ${percent(top2.pHit)}` : '暂无记录'}</small>
        </div>
        <div className="metric">
          <span>本次计划</span>
          <strong>{config.plannedPackCount} 包</strong>
          <small>{top ? `Top1至少中1盒 ${percent(top.atLeastOneHit)}` : '等待计算'}</small>
        </div>
        <div className="metric">
          <span>Top1至少中2盒</span>
          <strong>{percent(topAtLeastTwoHits)}</strong>
          <small>按本次计划 {config.plannedPackCount} 包估算</small>
        </div>
      </section>

      <section className="workbench">
        <aside className="settings-panel">
          <h2>参数</h2>
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
              <p>一行是一包，金银会合并到同一个角色概率里。</p>
            </div>
            <div className="button-row">
              <button type="button" onClick={addRecord}>新增一行</button>
              <button type="button" onClick={() => addRecords(10)}>新增10行</button>
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
                  <th>序号</th>
                  <th>SSR角色</th>
                  <th>金/银</th>
                  <th>UR角色</th>
                  <th>QTR</th>
                  <th>ER</th>
                  <th>SP</th>
                  <th>备注</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pagedRecords.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <input
                        type="number"
                        value={record.sequence}
                        onChange={(event) =>
                          updateRecord(record.id, { sequence: Number(event.target.value) })
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
                    <td>
                      <input
                        type="text"
                        value={record.note}
                        onChange={(event) => updateRecord(record.id, { note: event.target.value })}
                        placeholder="可记直播间线索"
                      />
                    </td>
                    <td>
                      <button type="button" className="icon-button" onClick={() => removeRecord(record.id)} aria-label="删除">
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
                {records.length === 0 && (
                  <tr>
                    <td colSpan={9} className="empty-cell">暂无记录，点“新增一行”开始录入。</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="csv-box">
            <textarea
              value={csvText}
              onChange={(event) => setCsvText(event.target.value)}
              placeholder="可粘贴CSV：sequence,ssrRole,ssrVariant,urRole,qtrId,erHit,spHit,note"
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
              <p>{result.qtrContinuity.detail}</p>
            </div>
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
          <div className="buy-grid">
            {buyCounts.map((count) => {
              const p = top
                ? calculateAtLeastKHitProbability(top.pHit, count, targetHitCount)
                : 0
              return (
                <div className="buy-row" key={count}>
                  <span>买 {count} 包</span>
                  <strong>{percent(p)}</strong>
                  <div className="bar"><i style={{ width: `${Math.min(100, p * 100)}%` }} /></div>
                </div>
              )
            })}
          </div>
        </section>
      </section>

      <section className="probability-panel">
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

      <section className="chart-panel">
        <div className="section-heading">
          <div>
            <h2>最近50包SSR频率</h2>
            <p>只看角色，不区分金银。</p>
          </div>
        </div>
        <div className="frequency-list">
          {ROLES.map((role) => {
            const recent = records
              .slice()
              .sort((a, b) => b.sequence - a.sequence)
              .slice(0, 50)
            const count = recent.filter((record) => record.ssrRole === role.id).length
            const max = Math.max(
              1,
              ...ROLES.map((item) => recent.filter((record) => record.ssrRole === item.id).length),
            )
            return (
              <div className="frequency-row" key={role.id}>
                <span>{role.id}</span>
                <b>{role.name}</b>
                <div className="bar"><i style={{ width: `${(count / max) * 100}%` }} /></div>
                <em>{count}</em>
              </div>
            )
          })}
        </div>
      </section>

      <footer>
        这是直播观察辅助工具，不是官方概率或收益承诺。记录越完整，模型越有参考价值。
      </footer>
    </main>
  )
}

export default App
