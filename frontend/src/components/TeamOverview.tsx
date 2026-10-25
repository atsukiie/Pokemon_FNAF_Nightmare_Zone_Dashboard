'use client';

import { useState } from 'react';
import Icon from './Icon';
import PlayerName from './PlayerName';
import { average, Battle, hasHp, hpPercent, Player, Session, stats, rosterComposition } from '../lib/dashboard';

type Props = { players: Player[]; battles: Battle[]; sessions: Session[]; historical?: boolean; onPlayer: (player: Player) => void; onEvidence: (text: string) => void };
const hp = hpPercent;
function PlayerCount({ label, owners }: { label: string; owners: { id: string; name: string; firstSeenAt?: string | null }[] }) {
  const [expanded, setExpanded] = useState(false);
  const names = owners.map(owner => owner.name).join('\n');
  return <span className="composition-player-count">
    <button type="button" title={names} aria-label={`${label}: ${owners.map(owner => owner.name).join(', ')}`} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{label}</button>
    {expanded && <span className="composition-owner-list">{owners.map(owner => <PlayerName key={owner.id} name={owner.name} firstSeenAt={owner.firstSeenAt}/>)}</span>}
  </span>;
}

export default function TeamOverview({ players, battles, sessions, onPlayer, onEvidence }: Props) {
  const [metric, setMetric] = useState('Win rate');
  const total = stats(battles);
  const composition = rosterComposition(players, battles);
  const rows = players.map(player => {
    const records = battles.filter(b => b.playerId === player.id), s = stats(records);
    return { player, ...s, value: metric === 'Win rate' ? s.winRate : metric === 'Current HP' ? hp(player) : s.wins };
  }).sort((a, b) => b.value - a.value || (metric === 'Win rate' ? b.played - a.played : 0) || a.player.name.localeCompare(b.player.name));
  const max = metric === 'Battles won' ? Math.max(1, ...rows.map(r => r.value)) : 100;
  const matchups = [...new Set(battles.map(b => b.opponent))].map(opponent => ({ opponent, ...stats(battles.filter(b => b.opponent === opponent)) })).sort((a, b) => b.played - a.played || b.winRate - a.winRate);
  const nights = [...new Set(sessions.map(s => s.night))].sort((a, b) => a - b).map(night => {
    const ids = new Set(sessions.filter(s => s.night === night).map(s => s.id));
    const records = battles.filter(b => ids.has(b.sessionId));
    return { night, ...stats(records), remaining: average(records.map(b => b.remainingHp)) };
  }).filter(n => n.played > 0);

  return <div className="team-overview">
    <div className="team-overview-pair">
      <section className="panel composition-panel">
        <div className="panel-heading"><h2><Icon name="ball"/> ROSTER COMPOSITION</h2><span className="count-badge">{composition.groups.length} types</span></div>
        <div className="composition-list">{composition.groups.map(({ type, count, pokemon, owners }) => <div className={`composition-row type-${type.toLowerCase()}`} key={type}>
          <span className="composition-type"><i/>{type}</span>
          <div className="composition-bar"><span style={{ width: `${count / composition.total * 100}%` }}/></div><PlayerCount label={String(count)} owners={owners}/>
          <details className="composition-pokemon"><summary>Show {pokemon.length} {pokemon.length === 1 ? 'Pokémon' : 'Pokémon species'}</summary>
            <ul>{pokemon.map(member => <li key={member.pokemon.toLowerCase()}><div><strong>{member.pokemon}</strong><PlayerCount label={`${member.players} ${member.players === 1 ? 'player' : 'players'}`} owners={member.owners}/></div><div className="composition-type-badges">{(member.types.length ? member.types : ['Unknown']).map(memberType => <span className={`type-${memberType.toLowerCase()}`} key={memberType}>{memberType}</span>)}</div></li>)}</ul>
          </details>
        </div>)}{!composition.groups.length && <div className="empty">No recorded Pokémon teams in this selection.</div>}</div>
        <p className="team-panel-note">Based on teams in selected battles. Each Pokémon is counted once per player and appears under both of its types. Expand a type to see the Pokémon. Older records without team history use the saved roster.</p>
      </section>
      <section className="panel contribution-panel"><div className="panel-heading"><h2><Icon name="chart"/> MEMBER COMPARISON</h2><select aria-label="Team comparison metric" value={metric} onChange={e => setMetric(e.target.value)}>{['Win rate', 'Current HP', 'Battles won'].map(m => <option key={m}>{m}</option>)}</select></div><div className="contribution-list">{rows.map(row => <button className="contribution-row" key={row.player.id} onClick={() => onPlayer(row.player)}><span className="contribution-name"><PlayerName name={row.player.name} firstSeenAt={row.player.firstSeenAt} className="scroll-label"/><small className="scroll-label" title={row.player.pokemon}>{row.player.pokemon}</small></span><span className="contribution-bar"><i style={{ width: `${row.value / max * 100}%` }}/></span><strong>{(metric === 'Win rate' && !row.played) || (metric === 'Current HP' && !hasHp(row.player)) ? '—' : `${Math.round(row.value)}${metric === 'Battles won' ? '' : '%'}`}</strong><Icon name="chevron" size={13}/></button>)}{!rows.length && <div className="empty">No members to compare.</div>}</div><p className="team-panel-note">{metric === 'Current HP' ? 'Recorded HP as a percentage of each Pokémon’s starting HP.' : `Based on ${total.played} battles in the selected period.`} Select a member to inspect their records.</p></section>
    </div>


    <section className="panel team-night-history"><div className="panel-heading"><h2><Icon name="moon"/> NIGHT-BY-NIGHT RESULTS</h2><span className="muted tiny">Selected period</span></div><div className="table-scroll"><table><thead><tr>{['Night', 'Battles', 'Wins / losses', 'Win rate', 'Avg. HP remaining', 'Avg. HP lost'].map(label => <th key={label}><span className="scroll-label" title={label}>{label}</span></th>)}</tr></thead><tbody>{nights.map(n => <tr key={n.night}>{[`Night ${n.night}`, String(n.played), `${n.wins} / ${n.losses}`, `${Math.round(n.winRate)}%`, n.remaining.toFixed(1), n.damageRecords ? n.received.toFixed(1) : '—'].map((label, index) => <td key={index} className={index === 3 ? 'win-rate' : undefined}><span className="scroll-label" title={label}>{label}</span></td>)}</tr>)}</tbody></table></div>{!nights.length && <div className="empty">No battle results in this period.</div>}<p className="team-panel-note">HP lost is the sum of actual per-turn HP reductions, including any recorded HP penalties.</p></section>

    <section className="panel team-matchups"><div className="panel-heading"><h2><Icon name="target"/> OPPONENT MATCHUPS</h2><span className="count-badge">{matchups.length}</span></div><div className="matchup-list">{matchups.map(m => <button className="matchup-row" key={m.opponent} onClick={() => onEvidence(`${m.opponent}: ${m.wins} wins and ${m.losses} losses across ${m.played} battles (${Math.round(m.winRate)}% win rate). Average HP lost ${m.received.toFixed(1)}. These are observed outcomes in the selected period, not inherent type advantages. Opponent difficulty, player level, and composition are not controlled.`)}><span className="matchup-name"><strong className="scroll-label" title={m.opponent}>{m.opponent}</strong><small className="scroll-label" title={`${m.wins} wins · ${m.losses} losses · ${m.played} battles`}>{m.wins} wins · {m.losses} losses · {m.played} battles</small></span><span className="matchup-rate">{Math.round(m.winRate)}%<small>win rate</small></span><Icon name="chevron" size={14}/></button>)}</div>{!matchups.length && <div className="empty">No opponents recorded in this selection.</div>}<p className="team-panel-note">Observed results only. Select an opponent for supporting evidence.</p></section>
  </div>;
}
