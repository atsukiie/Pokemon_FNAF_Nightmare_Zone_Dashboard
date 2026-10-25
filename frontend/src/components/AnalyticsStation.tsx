'use client';

import Icon from './Icon';
import PlayerName from './PlayerName';
import { Battle, historicalEstimate, hpBandLabel, hpPercent, Player, Session, stats } from '../lib/dashboard';

type Props = {
  players: Player[];
  battles: Battle[];
  sessions: Session[];
  activityAvailable: boolean;
  onPlayer: (player: Player) => void;
  onEvidence: (text: string) => void;
};

export default function AnalyticsStation({ players, battles, sessions, activityAvailable, onPlayer, onEvidence }: Props) {
  const playerRows = players.map(player => ({ player, ...stats(battles.filter(battle => battle.playerId === player.id)) }))
    .sort((a, b) => b.played - a.played || b.winRate - a.winRate || a.player.name.localeCompare(b.player.name));
  const encounters = [...new Set(battles.map(battle => battle.opponent))].map(opponent => ({ opponent, ...stats(battles.filter(battle => battle.opponent === opponent)) }))
    .sort((a, b) => b.played - a.played || b.winRate - a.winRate);
  const recentSession = [...sessions].sort((a, b) => b.order - a.order).find(session => battles.some(battle => battle.sessionId === session.id));
  const recentBattles = recentSession ? battles.filter(battle => battle.sessionId === recentSession.id) : [];
  const recentByPlayer = playerRows.map(({ player }) => ({ player, ...stats(recentBattles.filter(battle => battle.playerId === player.id)) })).filter(row => row.played > 0);
  const topPlayer = [...playerRows].filter(row => row.played > 0).sort((a, b) => b.winRate - a.winRate || b.played - a.played)[0];
  const toughestEncounter = encounters.filter(encounter => encounter.played >= 2).sort((a, b) => a.winRate - b.winRate || b.played - a.played)[0];
  const historySummary = historicalEstimate(battles);

  return <div className="analytics-station">
    <section className="panel analytics-station-panel">
      <div className="panel-heading"><h2><Icon name="users"/> PLAYER PROGRESS & WIN RATES</h2><span className="count-badge">{players.length} players</span></div>
      {activityAvailable && <p className="analytics-station-note">Current activity is available. HP bars show the latest saved snapshot; live HP may have changed.</p>}
      {!activityAvailable && <p className="analytics-station-note">Live activity is not reported by this data source. Progress below uses recorded battles and saved HP snapshots.</p>}
      <div className="analytics-progress-list">{playerRows.map(({ player, played, wins, winRate }) => {
        const hp = hpPercent(player);
        const activity = player.active === null ? 'Activity unknown' : player.active ? 'Active' : 'Inactive';
        return <button className="analytics-progress-row" key={player.id} onClick={() => onPlayer(player)}>
          <span className="analytics-progress-identity"><PlayerName name={player.name} firstSeenAt={player.firstSeenAt} className="scroll-label"/><small className="scroll-label" title={`${player.pokemon} · ${activity}`}>{player.pokemon} · {activity}</small></span>
          <span className="analytics-progress-bars"><span className="analytics-progress-caption">Win rate <strong>{played ? `${Math.round(winRate)}%` : 'No battles'}</strong></span><span className="analytics-progress-track"><i className="win" style={{ width: `${played ? winRate : 0}%` }}/></span><span className="analytics-progress-caption">Latest HP snapshot <strong>{player.hp !== null && player.maxHp ? `${player.hp}/${player.maxHp} · ${hpBandLabel(player.condition)}` : 'Not recorded'}</strong></span><span className="analytics-progress-track"><i className="hp" style={{ width: `${hp}%` }}/></span></span>
          <span className="analytics-progress-record"><strong>{wins}/{played}</strong><small>wins / battles</small></span><Icon name="chevron" size={14}/>
        </button>;
      })}{!playerRows.length && <div className="empty">No players in the current selection.</div>}</div>
    </section>

    <div className="analytics-station-pair">
      <section className="panel analytics-station-panel">
        <div className="panel-heading"><h2><Icon name="target"/> ANIMATRONIC ENCOUNTERS</h2><span className="count-badge">{encounters.length}</span></div>
        <div className="analytics-encounter-list">{encounters.map(encounter => <button key={encounter.opponent} className="analytics-encounter-row" onClick={() => onEvidence(`${encounter.opponent}: ${encounter.wins} wins and ${encounter.losses} losses across ${encounter.played} recorded battles (${Math.round(encounter.winRate)}% win rate). These are observed outcomes, not a forecast; opponent difficulty and team composition are not controlled.`)}><span><strong className="scroll-label" title={encounter.opponent}>{encounter.opponent}</strong><small>{encounter.played} battles · {encounter.wins} wins / {encounter.losses} losses</small></span><strong className="analytics-encounter-rate">{Math.round(encounter.winRate)}%<small>win rate</small></strong><Icon name="chevron" size={14}/></button>)}{!encounters.length && <div className="empty">No animatronic encounters in the current selection.</div>}</div>
        <p className="team-panel-note">Select an encounter to review the supporting battle records.</p>
      </section>

      <section className="panel analytics-station-panel">
        <div className="panel-heading"><h2><Icon name="trend"/> RECENT SESSION</h2><span className="muted tiny">{recentSession ? `Night ${recentSession.night} · ${recentSession.label}` : 'No session records'}</span></div>
        {recentSession ? <div className="analytics-recent-body"><strong className="analytics-recent-total">{stats(recentBattles).wins}<small> wins from {recentBattles.length} battles</small></strong>{recentByPlayer.map(({ player, wins, played, winRate }) => <div className="analytics-recent-row" key={player.id}><PlayerName name={player.name} firstSeenAt={player.firstSeenAt} className="scroll-label"/><span>{wins}/{played} wins</span><strong>{Math.round(winRate)}%</strong></div>)}</div> : <div className="empty">Record battles to see recent performance.</div>}
      </section>
    </div>

    <section className="panel analytics-station-panel analytics-forecast-panel">
      <div className="panel-heading"><h2><Icon name="bolt"/> HISTORICAL PERFORMANCE INSIGHTS</h2><span className="ai-label">BATTLE RECORDS</span></div>
      <div className="analytics-forecast-body">
        <div><h3>Historical win estimate</h3><p>{historySummary}</p><small>This summarizes past battles; it is not a validated next-encounter prediction.</small></div>
        <div><h3>Observed highlights</h3>{topPlayer || toughestEncounter ? <div className="analytics-insight-fallback">{topPlayer && <p><strong>Top win rate:</strong> <PlayerName name={topPlayer.player.name} firstSeenAt={topPlayer.player.firstSeenAt}/> won {topPlayer.wins} of {topPlayer.played} battles ({Math.round(topPlayer.winRate)}%).{topPlayer.played < 5 ? ' Small sample.' : ''}</p>}{toughestEncounter && <p><strong>Toughest encounter:</strong> {toughestEncounter.opponent} had {toughestEncounter.wins} wins from {toughestEncounter.played} battles ({Math.round(toughestEncounter.winRate)}%).</p>}</div> : <p>No completed battles are available for this selection yet.</p>}<small>Counts are shown to give each rate context.</small></div>
      </div>
    </section>
  </div>;
}
