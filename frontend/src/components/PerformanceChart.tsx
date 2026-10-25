'use client';
import { useId, useState } from 'react';
import PlayerName from './PlayerName';
import { average, Battle, Player, Session, stats } from '../lib/dashboard';

type Metric = 'Win rate' | 'Average HP' | 'Battles won' | 'HP lost';
export default function PerformanceChart({ sessions, battles, players }: { sessions: Session[]; battles: Battle[]; players?: Player[] }) {
  const [metric, setMetric] = useState<Metric>('Win rate');
  const [hover, setHover] = useState<number | null>(null);
  const gradient = useId().replaceAll(':', '');
  const points = [...sessions].filter(session => battles.some(battle => battle.sessionId === session.id)).sort((a, b) => a.order - b.order).map(session => {
    const records = battles.filter(b => b.sessionId === session.id), s = stats(records);
    const hpRecords = records.filter(b => b.startingHp > 0);
    const value = metric === 'Win rate' ? s.winRate : metric === 'Average HP' ? average(hpRecords.map(b => b.remainingHp / b.startingHp * 100)) : metric === 'Battles won' ? s.wins : s.received;
    return { ...session, value, wins: s.wins, battlesCount: records.length, count: metric === 'HP lost' ? s.damageRecords : metric === 'Average HP' ? hpRecords.length : records.length };
  }).filter(p => p.count > 0);
  const playerPoints = (players ?? []).map(player => {
    const records = battles.filter(battle => battle.playerId === player.id), result = stats(records);
    const hpRecords = records.filter(battle => battle.startingHp > 0);
    const count = metric === 'HP lost' ? result.damageRecords : metric === 'Average HP' ? hpRecords.length : records.length;
    const value = metric === 'Win rate' ? result.winRate : metric === 'Average HP' ? average(hpRecords.map(battle => battle.remainingHp / battle.startingHp * 100)) : metric === 'Battles won' ? result.wins : result.received;
    return { player, value, count, wins: result.wins, battles: records.length };
  }).filter(row => row.count > 0).sort((a, b) =>
    (metric === 'HP lost' ? a.value - b.value : b.value - a.value)
    || (metric === 'Win rate' ? b.battles - a.battles : 0)
    || a.player.name.localeCompare(b.player.name));
  const max = metric === 'Win rate' || metric === 'Average HP' ? 100 : Math.max(4, ...points.map(p => Math.ceil(p.value / 4) * 4));
  const chartWidth = Math.max(570, 90 + (points.length - 1) * 120);
  const x = (i: number) => 48 + (points.length === 1 ? 240 : i * (chartWidth - 90) / Math.max(1, points.length - 1));
  const y = (v: number) => 148 - v / max * 118;
  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const best = points.length ? points.reduce((a, b) => (metric === 'HP lost' ? b.value < a.value : b.value > a.value) ? b : a) : null;
  const worst = points.length ? points.reduce((a, b) => (metric === 'HP lost' ? b.value > a.value : b.value < a.value) ? b : a) : null;
  const delta = points.length > 1 ? points.at(-1)!.value - points.at(-2)!.value : null;
  const isPercent = metric === 'Win rate' || metric === 'Average HP';
  const valueLabel = (value: number) => `${value.toFixed(metric === 'Battles won' ? 0 : 1)}${isPercent ? '%' : ''}`;
  const hoveredPoint = hover === null ? null : points[hover];
  const tooltipX = hover === null ? 48 : Math.min(chartWidth - 270, Math.max(48, x(hover) - 130));
  const shortSessionLabel = (label: string) => label
    .replace(/^(\d{1,2}\/\d{1,2})\s+(\d{1,2}:\d{2})\s*[·•-]\s*N(\d+)$/, 'N$3 · $2')
    .replace(/\s*[·•-]\s*N(\d+)$/, ' · Night $1');
  const metricHelp: Record<Metric, string> = {
    'Win rate': 'Each point is one recorded session. Labels show wins out of completed battles.',
    'Average HP': 'Average remaining HP as a percentage of starting HP across recorded battles.',
    'Battles won': 'Number of wins in each session. Compare counts alongside the battle totals.',
    'HP lost': 'Average actual HP lost per recorded battle, capped by the available HP. Lower values mean less HP lost.',
  };
  const latest = points.at(-1), previous = points.at(-2);
  const recentSessions = points.slice(-3);
  const recentWins = recentSessions.reduce((sum, point) => sum + point.wins, 0);
  const recentBattles = recentSessions.reduce((sum, point) => sum + point.battlesCount, 0);
  const recentWinRate = recentBattles ? recentWins / recentBattles * 100 : 0;
  const trendText = !latest
    ? 'No sessions have records for this metric yet.'
    : metric === 'Win rate'
      ? `Latest session (${shortSessionLabel(latest.label)}): ${latest.wins} wins / ${latest.battlesCount} battles (${valueLabel(latest.value)}).${previous ? ` Previous session: ${previous.wins} / ${previous.battlesCount} (${valueLabel(previous.value)}).` : ' No previous session is available for comparison.'}${recentSessions.length > 1 ? ` Last ${recentSessions.length} sessions combined: ${recentWins} / ${recentBattles} (${recentWinRate.toFixed(1)}%).` : ''}${latest.battlesCount < 5 ? ` Latest session has only ${latest.battlesCount} ${latest.battlesCount === 1 ? 'battle' : 'battles'}; interpret its rate cautiously.` : ''}`
      : !previous
        ? `Latest session: ${valueLabel(latest.value)} ${metric === 'Battles won' ? 'wins' : metric === 'Average HP' ? 'average HP' : 'average HP lost'}. There is no earlier session to compare yet.${latest.battlesCount < 5 ? ` Small sample: only ${latest.battlesCount} ${latest.battlesCount === 1 ? 'battle' : 'battles'} in this session.` : ''}`
        : delta === 0
          ? `Latest session: ${metric.toLowerCase()} is unchanged at ${valueLabel(latest.value)} compared with the previous session.${latest.battlesCount < 5 ? ` Small sample: only ${latest.battlesCount} ${latest.battlesCount === 1 ? 'battle' : 'battles'} in the latest session.` : ''}`
          : `Latest session: ${metric.toLowerCase()} is ${valueLabel(latest.value)}, ${Math.abs(delta!).toFixed(1)}${isPercent ? ' percentage points' : ''} ${((metric === 'HP lost' ? delta! < 0 : delta! > 0) ? 'lower' : 'higher')} than the previous session.${latest.battlesCount < 5 ? ` Small sample: only ${latest.battlesCount} ${latest.battlesCount === 1 ? 'battle' : 'battles'} in the latest session.` : ''}`;
  const playerMetricSummary = !playerPoints?.length
    ? 'No players have records for this metric in the selected period.'
    : metric === 'Win rate'
      ? <>Highest win rate: <PlayerName name={playerPoints[0].player.name} firstSeenAt={playerPoints[0].player.firstSeenAt}/> ({playerPoints[0].wins} wins from {playerPoints[0].battles} battles, {valueLabel(playerPoints[0].value)}).</>
      : metric === 'HP lost'
        ? <>Lowest average HP lost: <PlayerName name={playerPoints[0].player.name} firstSeenAt={playerPoints[0].player.firstSeenAt}/> ({valueLabel(playerPoints[0].value)} across {playerPoints[0].count} records).</>
        : <><PlayerName name={playerPoints[0].player.name} firstSeenAt={playerPoints[0].player.firstSeenAt}/> leads in {metric.toLowerCase()} ({valueLabel(playerPoints[0].value)}).</>;
  if (players) return <section className="panel performance" id="performance">
    <div className="panel-heading"><h2>PLAYER COMPARISON <span>SELECTED PLAYERS</span></h2><select aria-label="Player comparison metric" value={metric} onChange={e => { setMetric(e.target.value as Metric); setHover(null); }}>{['Win rate', 'Average HP', 'Battles won', 'HP lost'].map(m => <option key={m}>{m}</option>)}</select></div>
    {!playerPoints.length ? <div className="empty">No player battle records in this period.</div> : <>
      <div className="chart-meta"><span><i className="legend-dot"/>{metric}{metric === 'Average HP' && ' (% of starting HP)'}</span><span className="muted">Ranked by selected metric · battle counts shown</span></div>
      <p className="chart-explanation">{metric === 'Win rate' ? 'Ranked by win rate, then by most completed battles when rates are tied.' : 'Compare players using the selected measure. Battle counts show how much history supports each rate.'}</p>
      <div className="player-comparison-list">{playerPoints.map(row => <div className="player-comparison-row" key={row.player.id}>
        <PlayerName name={row.player.name} firstSeenAt={row.player.firstSeenAt} className="player-comparison-name scroll-label"/>
        <span className="player-comparison-track" role="img" aria-label={`${row.player.name}: ${valueLabel(row.value)}`}><i style={{ width: `${Math.max(0, Math.min(100, metric === 'Battles won' ? row.value / Math.max(1, ...playerPoints.map(point => point.value)) * 100 : row.value))}%` }}/></span>
        <strong className="player-comparison-value">{valueLabel(row.value)}</strong>
        <small>{row.wins}/{row.battles} wins</small>
      </div>)}</div>
      <p className="chart-takeaway">{playerMetricSummary}</p>
    </>}
  </section>;
  return <section className="panel performance" id="performance">
    <div className="panel-heading"><h2>TEAM PERFORMANCE <span>FULL RECORDED HISTORY</span></h2><select aria-label="Performance metric" value={metric} onChange={e => { setMetric(e.target.value as Metric); setHover(null); }}>{['Win rate', 'Average HP', 'Battles won', 'HP lost'].map(m => <option key={m}>{m}</option>)}</select></div>
    {!points.length ? <div className="empty">No battle records in this period.</div> : <>
    <div className="chart-meta"><span><i className="legend-dot"/>{metric}{metric === 'Average HP' && ' (% of starting HP)'}</span><span className="muted">Sessions ordered oldest to newest · labels show night and time</span></div>
    <p className="chart-explanation">{metricHelp[metric]}</p>
    {points.length === 1 ? <div className="single-session-summary" role="group" aria-label={`${metric} for ${points[0].label}`}>
      <div className="single-session-value">{valueLabel(points[0].value)}<span>{metric}</span></div>
      <div className="single-session-meta"><strong>{points[0].label}</strong><span>{metric === 'Win rate' ? `${points[0].wins} wins from ${points[0].count} ${points[0].count === 1 ? 'battle' : 'battles'}` : `${points[0].count} ${points[0].count === 1 ? 'record' : 'records'} in this session`}</span></div>
      {isPercent && <div className="single-session-track" role="img" aria-label={`${valueLabel(points[0].value)} of 100`}><span style={{ width: `${Math.max(0, Math.min(100, points[0].value))}%` }}/></div>}
      {points[0].count < 5 && <p className="single-session-caveat">Small sample: this result is based on fewer than 5 {metric === 'HP lost' ? 'HP records' : 'battles'}.</p>}
    </div> : <div className="performance-history-scroll" role="region" aria-label="Full night history" tabIndex={0}><svg className="line-chart" style={{ minWidth: chartWidth }} viewBox={`0 0 ${chartWidth} 185`} role="img" aria-label={`${metric} over ${points.length} sessions`}>
      <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a855f7" stopOpacity=".28"/><stop offset="100%" stopColor="#a855f7" stopOpacity="0"/></linearGradient></defs>
      {[0, 1, 2, 3, 4].map(t => <g key={t}><line x1="48" x2={chartWidth - 42} y1={y(t * max / 4)} y2={y(t * max / 4)} stroke="#28243e" strokeDasharray="3 4"/><text x="35" y={y(t * max / 4) + 4} textAnchor="end">{Math.round(t * max / 4)}{isPercent ? '%' : ''}</text></g>)}
      <polygon points={`${x(0)},148 ${line} ${x(points.length - 1)},148`} fill={`url(#${gradient})`}/>
      <polyline points={line} stroke="#c16bfa" fill="none" strokeWidth="2.5" strokeLinejoin="round"/>
      {points.map((p, i) => <g key={p.id}><line x1={x(i)} x2={x(i)} y1="30" y2="148" stroke="#28243e" opacity=".4"/><circle cx={x(i)} cy={y(p.value)} r={hover === i ? 6 : 4.5} fill="#c16bfa" stroke="#21102f" strokeWidth="2" tabIndex={0} aria-label={`${p.label}: ${valueLabel(p.value)}${metric === 'Win rate' ? `, ${p.wins} wins from ${p.count} battles` : `, based on ${p.count} ${p.count === 1 ? 'battle' : 'battles'}`}`} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}/><text className="point-value" x={x(i)} y={Math.max(17, y(p.value) - 12)} textAnchor="middle">{metric === 'Win rate' ? `${p.wins} of ${p.count}` : valueLabel(p.value)}</text><text x={x(i)} y="173" textAnchor="middle">{shortSessionLabel(p.label)}</text></g>)}
      {hoveredPoint && <g pointerEvents="none" role="tooltip"><rect x={tooltipX} y="2" width="260" height="48" rx="5" fill="#eee4ff"/><text x={tooltipX + 130} y="20" textAnchor="middle" style={{ fill: '#251438', fontSize: 12 }}><tspan x={tooltipX + 130}>{metric}: {valueLabel(hoveredPoint.value)}</tspan><tspan x={tooltipX + 130} dy="19">{metric === 'Win rate' ? `${hoveredPoint.wins} ${hoveredPoint.wins === 1 ? 'win' : 'wins'} from ${hoveredPoint.count} ${hoveredPoint.count === 1 ? 'battle' : 'battles'}` : `Based on ${hoveredPoint.count} ${hoveredPoint.count === 1 ? 'battle' : 'battles'}`}</tspan></text></g>}
    </svg></div>}
    <p className="chart-takeaway">{trendText}</p>
    <div className="chart-footer"><span>{metric === 'HP lost' ? 'Lowest HP lost' : 'Highest value'} <strong>{best ? shortSessionLabel(best.label) : ''}</strong></span><span>{metric === 'HP lost' ? 'Highest HP lost' : 'Lowest value'} <strong>{worst ? shortSessionLabel(worst.label) : ''}</strong></span></div>
    </>}
  </section>;
}
