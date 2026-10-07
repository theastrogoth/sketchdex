import type { ReactNode } from 'react'
import type { Translate } from '../i18n/ui.ts'
import { Dialog } from './Dialog.tsx'
import { HELP_EXAMPLES } from './helpExamples.ts'

/** How queries are written, a section at a time, each with examples to try. */
export function HelpDialog({ t, onClose, onExample }: { t: Translate; onClose(): void; onExample(query: string): void }) {
  const section = (title: string, examples: readonly string[], children: ReactNode) => (
    <section className="help-section">
      <h3>{title}</h3>
      {children}
      <p className="examples">
        {examples.map((example) => <button key={example} type="button" className="example" onClick={() => onExample(example)}>{example}</button>)}
      </p>
    </section>
  )
  return (
    <Dialog label={t('Help')} onClose={onClose}>
      <header className="detail-header">
        <h2>{t('Help')}</h2>
        <button type="button" className="dialog-close" aria-label={t('Close')} onClick={onClose}>×</button>
      </header>
      {section('Basics', HELP_EXAMPLES.basics, (
        <>
          <p>
            Start typing a name and pick a filter from the list. You can filter by Pokémon, type, ability, move, location, game,
            generation, egg group, and more.
          </p>
          <p>
            Each filter narrows the results. Each result shows the games it matches in; click one for its details. Click any example
            below to try it.
          </p>
        </>
      ))}
      {section('Combining filters', HELP_EXAMPLES.composing, (
        <ul className="meanings">
          <li>Filters next to each other must all be true. You can also write <code>and</code> or <code>&amp;</code>.</li>
          <li><code>or</code> (or <code>|</code>) means either one.</li>
          <li><code>not</code> (or <code>!</code>, or <code>-</code> in front of a filter) excludes.</li>
          <li>Parentheses group filters together.</li>
        </ul>
      ))}
      {section('Games and regions', HELP_EXAMPLES.games, (
        <>
          <p>
            Filters are checked <em>one game at a time</em>. <code>levitate scarlet</code> finds Pokémon that have Levitate in
            Scarlet.
          </p>
          <p>When two filters could never be true in the same game, each is checked on its own instead:</p>
          <ul className="meanings">
            <li><code>sword scarlet</code>: in both Sword and Scarlet.</li>
            <li><code>paldea kanto</code>: found in both regions, in any games. A location counts as its region.</li>
            <li><code>scarlet kanto</code>: in Scarlet, and found in Kanto in some other game.</li>
          </ul>
          <p><code>not</code> depends on what comes after it:</p>
          <ul className="meanings">
            <li>
              Before a type, ability, move, or stat, it is checked one game at a time. <code>not fairy</code> includes Clefairy for
              the games where it was not yet a Fairy type.
            </li>
            <li>
              Before a game, a location, or an availability filter, it means “in none of these games”. <code>not gen 8</code>: in no
              Generation VIII game. <code>not johto</code>: never found in Johto.
            </li>
            <li>
              If other filters name games, “these games” are those games. <code>gen 2 not catchable</code>: in Generation II, but
              not catchable in any Generation II game.
            </li>
          </ul>
          <p>
            To find version exclusives: <code>catchable:scarlet -catchable:violet</code>.
          </p>
          <p>
            <code>anygame(…)</code> turns off the one-game-at-a-time rule for the filters inside it. Game groups have short names:{' '}
            <code>frlg</code>, <code>swsh</code>, <code>rse</code>, <code>lza</code>.
          </p>
        </>
      ))}
      {section('Prefixes', HELP_EXAMPLES.prefixes, (
        <>
          <p>
            Some names mean more than one thing: Fairy is a type and an egg group, Surf a move and a way to find Pokémon. A prefix
            says which you mean.
          </p>
          <p>
            <code>type:</code> <code>ability:</code> <code>hidden:</code> <code>egg:</code> <code>move:</code> <code>movetype:</code>{' '}
            <code>method:</code> <code>place:</code> <code>region:</code> <code>game:</code> <code>gen:</code> <code>introduced:</code>{' '}
            <code>species:</code> <code>form:</code>
          </p>
          <p>Without a prefix, a Pokémon’s own traits (type, ability) come before moves and locations.</p>
        </>
      ))}
      {section('Comparing numbers', HELP_EXAMPLES.numbers, (
        <>
          <p>
            Compare a value with a number, or with another value, using <code>&lt;</code> <code>&lt;=</code> <code>=</code>{' '}
            <code>!=</code> <code>&gt;=</code> <code>&gt;</code>.
          </p>
          <ul className="meanings">
            <li>Stats: <code>hp</code> <code>atk</code> <code>def</code> <code>spa</code> <code>spd</code> <code>spe</code> <code>bst</code></li>
            <li>EVs yielded: <code>evhp</code> <code>evatk</code> <code>evdef</code> <code>evspa</code> <code>evspd</code> <code>evspe</code></li>
            <li>
              Other: <code>height</code> <code>weight</code> <code>catchrate</code> <code>baseexp</code> <code>friendship</code>{' '}
              <code>eggcycles</code> <code>dex</code> <code>types</code> <code>abilities</code>
            </li>
            <li>Gender, in percent: <code>male</code> <code>female</code></li>
            <li>Evolution: <code>stage</code> (1 for unevolved) and <code>evolevel</code></li>
            <li>Damage taken from a type: <code>vs:fire</code> (2 is double damage)</li>
            <li>The game’s generation: <code>generation</code></li>
          </ul>
        </>
      ))}
      {section('Other traits', HELP_EXAMPLES.details, (
        <ul className="meanings">
          <li>Tags: <code>legendary</code> <code>mythical</code> <code>pseudo-legendary</code> <code>ultra beast</code> <code>paradox</code> <code>mega</code></li>
          <li>Gender: <code>genderless</code> <code>always male</code> <code>always female</code></li>
          <li>Growth rate: <code>growth:slow</code></li>
          <li>Hidden ability: <code>has:hidden-ability</code>, or <code>hidden:</code> with an ability’s name</li>
          <li>
            Availability: <code>catchable</code> <code>obtainable</code> <code>trade</code> <code>breed</code> <code>event</code>{' '}
            <code>transfer</code>. Add a game after a colon: <code>catchable:scarlet</code>. <code>obtainable</code> is any way of
            getting one within the game: catching, evolving, breeding, a gift, or an in-game trade, but not a transfer or an event.
          </li>
          <li>
            Type matchups: <code>weak:fire</code> <code>resists:fire</code> <code>immune:fire</code> <code>neutral:fire</code>. These
            count if any one of its abilities gives that result. Put <code>always-</code> in front to require every ability, or{' '}
            <code>base-</code> to ignore abilities.
          </li>
          <li>Wild held items: <code>holds:lucky-egg</code>, or <code>has:held-item</code> for any item.</li>
        </ul>
      ))}
      {section('Moves', HELP_EXAMPLES.moves, (
        <>
          <p>A move’s name finds the Pokémon that learn it.</p>
          <p>
            <code>move(…)</code> describes a single move. Inside it you can use the move’s type (<code>movetype:</code>), category
            (<code>physical</code> <code>special</code> <code>status</code>), flags (<code>flag:</code>), how it is learned
            (<code>learn:tm</code> <code>level up</code> <code>egg move</code>), and its numbers (<code>power</code> or{' '}
            <code>bp</code>, <code>accuracy</code>, <code>pp</code>, <code>priority</code>, <code>learnlevel</code>).
          </p>
          <p>
            Without <code>move(…)</code>, move filters next to each other are assumed to describe the same move when that makes
            sense.
          </p>
        </>
      ))}
      {section('Encounters', HELP_EXAMPLES.encounters, (
        <>
          <p>A location or region finds the Pokémon you can meet there.</p>
          <p>
            <code>encounter(…)</code> describes a single encounter. Inside it you can use the location, the method
            (<code>surfing</code> <code>fishing</code> <code>walking</code> <code>static</code> <code>gift</code> <code>raid</code>),
            the time of day, season, and weather, and the numbers <code>level</code>, <code>rate</code>, and for raids{' '}
            <code>stars</code>.
          </p>
          <p>
            <code>night</code> finds Pokémon that appear at night. <code>only at night</code> finds those that appear at no other
            time. The same works for weather (<code>only in rain</code>) and, in Unova, seasons (<code>only in winter</code>).
          </p>
        </>
      ))}
      {section('Evolution and families', HELP_EXAMPLES.families, (
        <>
          <p>These filter a Pokémon by its relatives. Put any filters inside the parentheses.</p>
          <ul className="meanings">
            <li><code>prevo(…)</code>: something it evolves from matches</li>
            <li><code>evo(…)</code>: something it evolves into matches</li>
            <li><code>family(…)</code>: anything in its evolution line matches</li>
          </ul>
          <p>
            Where it is in its line: <code>basic</code> <code>evolved</code> <code>nfe</code> (can still evolve){' '}
            <code>fully evolved</code>, or <code>stage</code> as a number.
          </p>
          <p>
            How it evolves: <code>evolves:level</code> <code>evolves:item</code> <code>evolves:trade</code>{' '}
            <code>evolves:friendship</code> <code>evolves:move</code> <code>evolves:night</code> <code>evolves:day</code>{' '}
            <code>evolves:rain</code>. For a specific item or move: <code>evolves-with:</code> and <code>evolves-knowing:</code>.
          </p>
        </>
      ))}
    </Dialog>
  )
}
