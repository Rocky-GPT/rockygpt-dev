import {
  type CardNode, dateInName, dayParts, daysAway, firstRow, linked, nameWithoutDate, record, shortUrl, text, texts,
} from '@/lib/graph-cards';
import { type CardContext, CardLayout } from './layout';
import { Photo } from './Photo';
import { EventList } from './places';
import { Action, Badge, Box, Chips, Empty, Hero, NodeChip, NodeRow, Prose, Row, Source, SubHead, Tile } from './parts';

/** A big calendar tile: month, day, weekday. */
function DateTile({ iso }: { iso: string | null }) {
  if (!iso) return <Tile>📅</Tile>;
  const parts = dayParts(iso);
  return (
    <div className="w-24 overflow-hidden rounded-2xl border-2 border-[var(--k)] bg-[#262626] text-center">
      <div className="bg-[var(--k)] py-1 text-[13px] font-extrabold text-[#1a1a1a]">{parts.month}</div>
      <div className="pt-1 text-4xl font-extrabold leading-tight">{parts.day}</div>
      <div className="pb-2 text-xs text-zinc-400">{parts.weekday}</div>
    </div>
  );
}

/** A club, or an organization (an Archway department or group): its listing and its events. */
export function ClubCard({ ctx }: { ctx: CardContext }) {
  const { read } = ctx;
  const club = firstRow(read, 'clubs') ?? {};
  const listing = record(club.listing);
  const events = linked(read, 'in', 'organized_by', 'event');
  const upcoming = events.filter(node => (dateInName(node.label) ?? '9999') >= ctx.today).length;
  const website = text(club.website_url) ?? text(listing.websiteUrl);
  const email = text(listing.email);
  const status = read.status;
  const mission = text(listing.mission)?.replace(/^Mission\s*/, '');
  const meetsIn = linked(read, 'out', ['meets_in', 'located_at']);
  const short = read.node.label.split(/\s+/).filter(word => /^\p{Lu}/u.test(word)).map(word => word[0]).join('').slice(0, 4);
  return (
    <CardLayout ctx={ctx} gaps={[...(status ? [] : ['status']), ...(meetsIn.length ? [] : ['meets in'])]}
      hero={(
        <Hero kind={read.node.kind} title={read.node.label}
          visual={text(listing.logoUrl)
            ? <Photo src={text(listing.logoUrl)} name={short || read.node.label} className="h-24 w-24 rounded-3xl border-2 border-[var(--k)] bg-white text-2xl" />
            : <Tile small>{short || '★'}</Tile>}
          subtitle={[text(club.category) ?? text(listing.category), text(listing.membershipInfo)].filter(Boolean).join(' · ') || undefined}>
          <Row>
            {events.length > 0 && <Badge tone="pink">{upcoming} upcoming events</Badge>}
            {status ? <Badge tone={/inactive/i.test(status) ? 'rose' : 'green'}>{status}</Badge>
              : read.node.kind === 'club' && <Badge tone="amber">Active or not: not in the graph yet</Badge>}
          </Row>
          <Row>
            {email && <Action kind="mail" href={`mailto:${email}`}>{email}</Action>}
            {website && <Action kind="web" href={website}>{shortUrl(website)}</Action>}
            {text(listing.instagramUrl) && <Action kind="web" href={text(listing.instagramUrl)}>Instagram</Action>}
          </Row>
        </Hero>
      )}
      main={(
        <>
          <Box title="Mission">
            {mission ? <Prose>{mission}</Prose> : <Empty title="No mission in the graph" />}
            {mission && <Source>the Archway listing</Source>}
          </Box>
          <Box title="Events" note={events.length ? `${events.length} · they link to this ${read.node.kind}` : undefined}>
            <EventList nodes={events} ctx={ctx} />
          </Box>
        </>
      )}
      side={(
        <>
          <Box title="Status">
            {status ? <p className="text-sm">{status}</p> : <Empty title="Active or inactive: not in the graph yet">It comes with the club status step.</Empty>}
          </Box>
          <Box title="Officers and advisor">
            <Empty title="Not in the graph">The Archway listing we read doesn&apos;t name them.</Empty>
          </Box>
        </>
      )} />
  );
}

export function EventCard({ ctx }: { ctx: CardContext }) {
  const { read, href } = ctx;
  const event = firstRow(read, 'events') ?? {};
  const listing = record(event.listing);
  const day = dateInName(read.node.label) ?? (text(event.date_label) ? dateInName(`x (${text(event.date_label)!.replace(/^\w+,\s*/, '')})`) : null);
  const hosts = linked(read, 'out', 'organized_by');
  const buildings = linked(read, 'out', ['held_in', 'located_at']);
  const terms = linked(read, 'out', 'in_term');
  const time = [text(event.start_time), text(event.end_time)].filter(Boolean).join(' – ');
  const link = text(event.event_url) ?? text(listing.url);
  const image = text(listing.imageUrl);
  const where = text(listing.location);
  return (
    <CardLayout ctx={ctx} gaps={[...(buildings.length ? [] : ['building']), ...(terms.length ? [] : ['term'])]}
      hero={(
        <Hero kind="event" title={text(event.title) ?? nameWithoutDate(read.node.label)} visual={<DateTile iso={day} />}
          subtitle={[text(event.date_label), time || null, day ? daysAway(ctx.today, day) : null].filter(Boolean).join(' · ')}>
          <Row>
            {text(listing.ticketStatus) && <Badge tone="green">{text(listing.ticketStatus)}</Badge>}
            {texts(listing.tags).map(tag => <Badge key={tag}>{tag}</Badge>)}
            {hosts.map(node => <NodeChip key={node.id} node={node} href={href} detail="host" />)}
          </Row>
          {link && <Row><Action kind="web" href={link}>RSVP / details on {shortUrl(link).split('/')[0]}</Action></Row>}
        </Hero>
      )}
      main={(
        <>
          <Box title="About">
            {text(event.description) ? <Prose>{text(event.description)}</Prose> : <Empty title="No description in the graph" />}
            {link && <Source>{shortUrl(link)}</Source>}
          </Box>
          {image && (
            <Box title="Poster">
              <Photo src={image} name={`Poster for ${read.node.label}`} hideIfMissing className="max-h-96 rounded-xl" />
            </Box>
          )}
        </>
      )}
      side={(
        <>
          <Box title="Hosted by">
            {hosts.length ? <div className="flex flex-col gap-1">{hosts.map(node => <NodeRow key={node.id} node={node} href={href} detail={`${node.kind} · see all its events`} />)}</div>
              : <Empty title="No host linked">{text(event.organizer) ? `The listing names "${text(event.organizer)}".` : null}</Empty>}
          </Box>
          <Box title="Where">
            {where && <p className="mb-2 text-sm text-zinc-300">The listing says: <i>“{where}”</i></p>}
            {buildings.length ? <Chips>{buildings.map(node => <NodeChip key={node.id} node={node} href={href} />)}</Chips>
              : <Empty title="Not linked to a building">Events aren&apos;t linked to rooms or buildings yet.</Empty>}
          </Box>
          <Box title="Term">
            {terms.length ? <Chips>{terms.map(node => <NodeChip key={node.id} node={node} href={href} />)}</Chips>
              : <Empty title="Not linked to a term yet" />}
          </Box>
        </>
      )} />
  );
}

/** A term ("Fall 2026"): every date on its calendar, month by month, the next one marked. */
export function TermCard({ ctx }: { ctx: CardContext }) {
  const { read, href } = ctx;
  const term = firstRow(read, 'terms') ?? {};
  const dates = linked(read, 'in', 'in_term')
    .map(node => ({ node, day: dateInName(node.label) }))
    .sort((a, b) => (a.day ?? '9999').localeCompare(b.day ?? '9999'));
  const next = dates.find(item => item.day && item.day >= ctx.today);
  const months = new Map<string, typeof dates>();
  for (const item of dates) {
    const month = item.day ? new Date(`${item.day}T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'No date';
    months.set(month, [...months.get(month) ?? [], item]);
  }
  const first = dates[0]?.day;
  const last = dates.at(-1)?.day;
  const now = first && last && ctx.today >= first && ctx.today <= last;
  const page = text(term.source_url);
  return (
    <CardLayout ctx={ctx}
      hero={(
        <Hero kind="term" title={read.node.label} visual={<Tile>🗓️</Tile>}
          subtitle={first && last ? `${dayParts(first).long} to ${dayParts(last).long}` : undefined}>
          <Row>
            {now ? <Badge tone="green">Happening now</Badge> : first && ctx.today < first ? <Badge>Starts {daysAway(ctx.today, first)}</Badge> : <Badge>Over</Badge>}
            <Badge>{dates.length} dates</Badge>
            {next && <NodeChip node={next.node} href={href} detail={`next · ${daysAway(ctx.today, next.day!)}`} />}
          </Row>
          {page && <Row><Action kind="web" href={page}>{shortUrl(page)}</Action></Row>}
        </Hero>
      )}
      main={(
        <Box title="Calendar" note={`${dates.length} dates`}>
          {dates.length === 0 && <Empty title="No dates linked to this term" />}
          {[...months.entries()].map(([month, items]) => (
            <div key={month}>
              <SubHead>{month}</SubHead>
              <div className="flex flex-col gap-0.5">
                {items.map(({ node, day }) => {
                  const parts = day ? dayParts(day) : null;
                  return (
                    <NodeRow key={node.id} node={{ ...node, label: nameWithoutDate(node.label) }} href={href}
                      highlight={next?.node.id === node.id}
                      lead={<span className={`min-w-[84px] rounded-md px-2 py-0.5 text-center font-mono text-[12.5px] ${day && day < ctx.today ? 'bg-[#242424] text-zinc-500' : 'bg-purple-950/60 text-purple-300'}`}>{parts ? `${parts.weekday.toUpperCase()} ${parts.day}` : '—'}</span>}
                      detail={next?.node.id === node.id ? `next · ${daysAway(ctx.today, day!)}` : undefined} />
                  );
                })}
              </div>
            </div>
          ))}
          {page && <Source>{shortUrl(page)}</Source>}
        </Box>
      )} />
  );
}

export function CalendarDateCard({ ctx }: { ctx: CardContext }) {
  const { read, href } = ctx;
  const row = firstRow(read, 'calendar_dates') ?? {};
  const day = text(row.date)?.slice(0, 10) ?? dateInName(read.node.label);
  const terms = linked(read, 'out', 'in_term');
  const page = text(row.source_url);
  return (
    <CardLayout ctx={ctx}
      hero={(
        <Hero kind="calendar_date" label="Calendar date" title={text(row.title) ?? nameWithoutDate(read.node.label)} visual={<DateTile iso={day} />}
          subtitle={[day ? dayParts(day).long : text(row.date_label), text(row.time), day ? daysAway(ctx.today, day) : null].filter(Boolean).join(' · ')}>
          <Row>
            {terms.map(node => <NodeChip key={node.id} node={node} href={href} />)}
            {text(row.kind) && <Badge>{text(row.kind)}</Badge>}
            {text(row.family) && <Badge>{text(row.family)}</Badge>}
            {text(row.session) && <Badge tone="sky">{text(row.session)}</Badge>}
          </Row>
          {page && <Row><Action kind="web" href={page}>{shortUrl(page)}</Action></Row>}
        </Hero>
      )}
      main={(
        <Box title="On the calendar">
          <p className="text-sm text-zinc-300">“{text(row.title) ?? read.node.label}”{text(row.date_label) ? ` is listed for ${text(row.date_label)}` : ''}{terms.length ? ` in ${terms.map(term => term.label).join(' and ')}` : ''}.</p>
          {page && <Source>{shortUrl(page)}</Source>}
        </Box>
      )}
      side={(
        <Box title="In terms" note={terms.length}>
          {terms.length ? <Chips>{terms.map(node => <NodeChip key={node.id} node={node} href={href} detail="see its whole calendar" />)}</Chips> : <Empty title="Not linked to a term" />}
        </Box>
      )} />
  );
}

/**
 * Any type with no design of its own yet: its name, every record it links shown as fields, and
 * its links as chips by kind. A new kind from the data shows up here with no code change.
 */
export function DefaultCard({ ctx }: { ctx: CardContext }) {
  const { read, href } = ctx;
  const groups = new Map<string, CardNode[]>();
  for (const link of [...(read.outgoing ?? []), ...(read.incoming ?? [])]) {
    if (!link.node) continue;
    const key = `${link.type} · ${link.node.kind}`;
    groups.set(key, [...groups.get(key) ?? [], link.node]);
  }
  return (
    <CardLayout ctx={ctx}
      hero={(
        <Hero kind={read.node.kind} title={read.node.label} visual={<Tile small>{read.node.kind.slice(0, 2).toUpperCase()}</Tile>}
          subtitle={read.node.aliases?.length ? `Also called: ${read.node.aliases.join(', ')}` : undefined}>
          {read.status && <Row><Badge tone="amber">{read.status}</Badge></Row>}
        </Hero>
      )}
      main={(
        <>
          {(read.facts ?? []).map(fact => (
            <Box key={fact.collection} title={fact.collection.replace(/_/g, ' ')} note={`${fact.rows.length} of ${fact.total}`}>
              <div className="space-y-4">
                {fact.rows.slice(0, 10).map((row, index) => (
                  <dl key={index} className="grid grid-cols-[minmax(90px,auto)_1fr] gap-x-3 gap-y-1 text-[13px]">
                    {Object.entries(row).map(([key, value]) => (
                      <div key={key} className="contents">
                        <dt className="text-zinc-500">{key.replace(/_/g, ' ')}</dt>
                        <dd className="min-w-0 break-words">{typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : <code className="text-xs text-zinc-400">{JSON.stringify(value)}</code>}</dd>
                      </div>
                    ))}
                  </dl>
                ))}
              </div>
            </Box>
          ))}
          {!read.facts?.length && <Box title="Facts"><Empty title="No records linked to this node" /></Box>}
        </>
      )}
      side={(
        <Box title="Links" note={[...groups.values()].reduce((sum, nodes) => sum + nodes.length, 0)}>
          {groups.size === 0 && <Empty title="No links yet" />}
          {[...groups.entries()].map(([key, nodes]) => (
            <div key={key}><SubHead>{key.replace(/_/g, ' ')}</SubHead><Chips>{nodes.map(node => <NodeChip key={node.id} node={node} href={href} />)}</Chips></div>
          ))}
        </Box>
      )} />
  );
}
