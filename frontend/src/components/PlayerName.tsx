import type { Player } from '../lib/dashboard';

const BETA_CUTOFF = Date.parse('2026-10-27T00:00:00Z');

type Props = Pick<Player, 'name' | 'firstSeenAt'> & { className?: string; title?: string };

export default function PlayerName({ name, firstSeenAt, className, title }: Props) {
  const beta = Boolean(firstSeenAt && Date.parse(firstSeenAt) < BETA_CUTOFF);
  return <span className={`player-name-with-beta${className ? ` ${className}` : ''}`}>
    <span className="player-name-text" title={title ?? name}>{name}</span>
    {beta && <span className="beta-badge" title="First recorded encounter was before October 27, 2026">BETA</span>}
  </span>;
}
