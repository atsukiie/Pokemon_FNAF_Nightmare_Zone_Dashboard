import PlayerName from './PlayerName';
import type { Battle, Dataset, Player } from '../lib/dashboard';
import { hpBandLabel, hpPercent, hasHp, stats } from '../lib/dashboard';

type Props = {
  data: Dataset;
  battles: Battle[];
  updated: string;
  loading: boolean;
  mode: 'live' | 'sample';
  autoRefresh: boolean;
  connectionError: string;
  onRefresh: () => void;
  onPlayer: (player: Player) => void;
};

const rate = (value: number) => `${Math.round(value)}%`;

export default function AdminOverview({ data, battles, updated, loading, mode, autoRefresh, connectionError, onRefresh, onPlayer }: Props) {
  const result = stats(battles);
  const ranked = data.players.map(player => ({ player, ...stats(battles.filter(battle => battle.playerId === player.id)) }))
    .filter(entry => typeof entry.player.mmr === 'number' && Number.isFinite(entry.player.mmr))
    .sort((a, b) => b.player.mmr! - a.player.mmr! || a.player.name.localeCompare(b.player.name));
  const recent = [...battles].slice(-6).reverse();
  const sessions = new Map(data.sessions.map(session => [session.id, session]));
  const hpWatch = data.players.filter(hasHp).sort((a, b) => hpPercent(a) - hpPercent(b)).slice(0, 3);
  const nights = new Set(data.sessions.filter(session => battles.some(battle => battle.sessionId === session.id)).map(session => session.night)).size;
  const endurance = data.players.map(player => {
    const playerBattles = battles.filter(battle => battle.playerId === player.id);
    const shiftWins = new Map<string, number>();
    for (const battle of playerBattles) {
      if (battle.outcome !== 'win') continue;
      const gameSession = battle.sessionId.replace(/:night-\d+$/, '');
      shiftWins.set(gameSession, (shiftWins.get(gameSession) ?? 0) + 1);
    }
    return {
      player,
      survived: playerBattles.filter(battle => battle.outcome === 'win').length,
      longestShift: Math.max(0, ...shiftWins.values()),
    };
  }).sort((a, b) => b.longestShift - a.longestShift || b.survived - a.survived || a.player.name.localeCompare(b.player.name));

  return <section className="admin-overview" aria-label="Game overview">
    <div className="overview-heading">
      <div>
        <p className="overview-eyebrow">GAME ACTIVITY</p>
        <h2>At a glance</h2>
        <p className="overview-subtitle">A straightforward summary of completed encounters in the connected game database.</p>
      </div>
      <div className="overview-source">
        <span className={`source-dot ${connectionError ? 'offline' : ''}`} />
        <span>{connectionError ? 'Connection issue' : mode === 'live' ? 'Connected game data' : 'Sample data'}</span>
        {updated && <small>Data as of {updated}</small>}
        <button onClick={onRefresh} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>
    </div>

    <div className="overview-kpis">
      <article><span>Registered trainers</span><strong>{data.players.length}</strong><small>Accounts in the game database</small></article>
      <article><span>Active game runs</span><strong>{mode === 'sample' ? '—' : data.activeRuns ?? '—'}</strong><small>{mode === 'sample' ? 'Switch to live data to view' : data.activeRuns === null || data.activeRuns === undefined ? 'Game API is unavailable' : `Currently open${autoRefresh ? ' · updates every 5s' : ' · auto-refresh off'}`}</small></article>
      <article><span>Completed battles</span><strong>{result.played}</strong><small>{result.wins} wins · {result.losses} losses</small></article>
      <article><span>Selected group win rate</span><strong>{result.played ? rate(result.winRate) : '—'}</strong><small>Wins ÷ battles in current filters</small></article>
      <article><span>Nights played</span><strong>{nights}</strong><small>With recorded encounters</small></article>
    </div>

    <div className="overview-columns">
      <section className="overview-card leaderboard-card">
        <div className="overview-card-heading"><div><h3>Top players</h3><p>Ranked by current MMR, highest first. Equal ratings are ordered by name.</p></div><span>{ranked.length} rated trainers</span></div>
        {ranked.length ? <div className="leaderboard-list">{ranked.slice(0, 8).map((entry, index) => <button className="leaderboard-row" key={entry.player.id} onClick={() => onPlayer(entry.player)}>
          <span className="rank-number">{index + 1}</span>
          <span className="leader-player"><PlayerName name={entry.player.name} firstSeenAt={entry.player.firstSeenAt} className="scroll-label"/><small className="scroll-label" title={entry.player.pokemon}>{entry.player.pokemon}</small></span>
          <span className="leader-wins"><strong>{entry.player.mmr?.toLocaleString()}</strong><small>MMR</small></span>
          <span className="leader-count">{entry.played} <small>battles</small></span>
          <span className="leader-rate">{entry.played ? rate(entry.winRate) : '—'}</span>
        </button>)}</div> : <p className="overview-empty">No player MMR records are available.</p>}
      </section>

      <section className="overview-card recent-card">
        <div className="overview-card-heading"><div><h3>Recent battles</h3><p>Most recent completed encounters in the database.</p></div><span>{recent.length} shown</span></div>
        {recent.length ? <div className="recent-list">{recent.map(battle => {
          const player = data.players.find(item => item.id === battle.playerId);
          const session = sessions.get(battle.sessionId);
          return <article className="recent-row" key={battle.id}>
            <span className={`result-mark ${battle.outcome}`}>{battle.outcome === 'win' ? 'W' : 'L'}</span>
            <div><strong className="scroll-label" title={player?.name ?? 'Unknown trainer'}>{player?.name ?? 'Unknown trainer'}</strong><small className="scroll-label" title={session ? `Night ${session.night} · ${session.label}` : 'Recorded encounter'}>{session ? `Night ${session.night} · ${session.label}` : 'Recorded encounter'}</small></div>
            <span className="battle-opponent scroll-label" title={`vs. ${battle.opponent}`}>vs. {battle.opponent}</span>
            <span className={`battle-outcome ${battle.outcome}`}>{battle.outcome === 'win' ? 'Win' : 'Loss'}</span>
          </article>;
        })}</div> : <p className="overview-empty">No completed battles have been recorded yet.</p>}
      </section>

      <section className="overview-card endurance-card">
        <div className="overview-card-heading"><div><h3>Night endurance</h3><p>How many nights each player has survived, and their longest recorded shift.</p></div></div>
        {endurance.length ? <div className="endurance-table">
          <div className="endurance-row endurance-header"><span>Player</span><span>Nights survived</span><span>Longest shift</span></div>
          {endurance.map(({ player, survived, longestShift }) => <button className="endurance-row" key={player.id} onClick={() => onPlayer(player)}>
            <span className="endurance-player"><PlayerName name={player.name} firstSeenAt={player.firstSeenAt} className="scroll-label"/><small className="scroll-label" title={player.pokemon}>{player.pokemon}</small></span>
            <strong>{survived}</strong><strong>{longestShift}</strong>
          </button>)}
        </div> : <p className="overview-empty">No registered players were returned by the game database.</p>}
        <p className="overview-footnote">Nights survived counts recorded wins. Longest shift is the most wins recorded within one game session.</p>
      </section>

      <section className="overview-card hp-card">
        <div className="overview-card-heading"><div><h3>Lowest HP in latest records</h3><p>Players with the least HP at the end of their latest recorded encounters.</p></div></div>
        {hpWatch.length ? <div className="hp-watch-list">{hpWatch.map(player => <div className="hp-watch-row" key={player.id}>
          <span><PlayerName name={player.name} firstSeenAt={player.firstSeenAt} className="scroll-label"/><small className="scroll-label" title={`${player.pokemon} · ${hpBandLabel(player.condition)}`}>{player.pokemon} / {hpBandLabel(player.condition)}</small></span>
          <span className="hp-watch-value">{player.hp}<small> / {player.maxHp} HP</small></span>
          <span className="hp-meter"><i className={player.condition.toLowerCase()} style={{ width: `${Math.min(100, hpPercent(player))}%` }} /></span>
        </div>)}</div> : <p className="overview-empty">No HP snapshots are available yet.</p>}
        <p className="overview-footnote">Historical encounter data only. HP resets each night, so this is not a current status indicator.</p>
      </section>

      <section className="overview-card readme-card">
        <h3>How to read this page</h3>
        <ul>
          <li>Battle totals come from completed encounters. Top players uses current stored MMR, independent of battle filters; players without MMR are excluded.</li>
          <li>Active runs are counted by the live game API; it does not expose each player’s current run or HP.</li>
          <li>Win rate is wins divided by completed battles; small samples can move quickly.</li>
          <li>Live player presence and levels are not recorded by the game database.</li>
        </ul>
      </section>
    </div>
  </section>;
}
