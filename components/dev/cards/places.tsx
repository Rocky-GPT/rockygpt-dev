import Link from 'next/link';
import {
  type CardNode, dayParts, kindColor, plural, datedEvents, factsOf, firstRow, hoursSpans, linked, menuMeals, openNow, record,
  rowsOf, shortUrl, text, texts, weekHours,
} from '@/lib/graph-cards';
import { type CardContext, CardLayout } from './layout';
import { MenuView } from './MenuView';
import { Action, Badge, Box, Chips, Code, Empty, Facts, Hero, MissingAction, More, NodeChip, NodeRow, Prose, Row, Source, Tile } from './parts';

/** Today's hours as a header badge: open now (until when), or closed (opens next at). */
export function OpenBadge({ rows, ctx }: { rows: Array<Record<string, unknown>>; ctx: CardContext }) {
  const today = weekHours(rows, ctx.today).find(day => day.day === ctx.weekday);
  if (!today) return null;
  const state = openNow(today.schedule, ctx.minutes);
  if (!state) return <Badge>Today: {today.schedule}</Badge>;
  return (
    <>
      {state.open
        ? <Badge tone="green">● Open now{state.label ? ` · ${state.label}` : ''} until {state.until}</Badge>
        : <Badge tone="rose">● Closed now</Badge>}
      {state.next && <Badge>Next: {state.next.label ? `${state.next.label} at ` : 'opens '}{state.next.text.split(' – ')[0]}</Badge>}
    </>
  );
}

/** A week of hours, today highlighted; days with the same hours share a line ("Mon – Fri"). */
export function HoursTable({ rows, ctx, source }: { rows: Array<Record<string, unknown>>; ctx: CardContext; source?: string | null }) {
  const week = weekHours(rows, ctx.today);
  if (!week.length) return <Empty title="No hours in the graph" />;
  const lines: Array<{ days: string[]; schedule: string; dated: boolean }> = [];
  for (const day of week) {
    const last = lines.at(-1);
    if (last && !day.dated && !last.dated && last.schedule === day.schedule) last.days.push(day.day);
    else lines.push({ days: [day.day], schedule: day.schedule, dated: day.dated });
  }
  const short = (day: string) => day.slice(0, 3);
  return (
    <>
      <table className="w-full text-left text-[13px]">
        <tbody>
          {lines.map(line => {
            const spans = hoursSpans(line.schedule);
            const isToday = line.days.includes(ctx.weekday);
            const name = line.days.length === 1 ? line.days[0] : `${short(line.days[0])} – ${short(line.days.at(-1)!)}`;
            return (
              <tr key={line.days.join()} className={`border-b border-[#2a2a2a] align-top ${isToday ? 'bg-[#232b31]' : ''}`}>
                <td className="w-24 whitespace-nowrap px-2 py-1.5 font-semibold">{name}{isToday ? <span className="block text-[10px] font-normal text-sky-300">today ({short(ctx.weekday)})</span> : null}</td>
                <td className="px-2 py-1.5 text-zinc-300">
                  {spans.length > 1 ? spans.map(span => (
                    <span key={span.text + span.label} className="flex justify-between gap-3">
                      <span className="whitespace-nowrap">{span.label}</span><span className="whitespace-nowrap text-zinc-400">{span.text}</span>
                    </span>
                  )) : line.schedule}
                  {line.dated && <span className="block text-[11px] text-amber-300">A one-off change for this day</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {week.find(day => day.notes)?.notes && <p className="mt-2 text-xs text-zinc-400">{week.find(day => day.notes)?.notes}</p>}
      {source && <Source>{shortUrl(source)}</Source>}
    </>
  );
}

/** Events in date order, upcoming first, each opening its own card. */
export function EventList({ nodes, ctx, limit = 8 }: { nodes: CardNode[]; ctx: CardContext; limit?: number }) {
  const events = datedEvents(nodes, ctx.today);
  if (!events.length) return <Empty title="No events linked" />;
  return (
    <div className="flex flex-col gap-0.5">
      <More items={events} first={limit} label="more events" render={({ node, date, past }) => {
        const parts = date ? dayParts(date) : null;
        const time = [node.brief?.start, node.brief?.end].filter(Boolean).join('–');
        return (
          <NodeRow key={node.id} node={{ ...node, label: node.label.replace(/\s*\(\d{4}-\d{2}-\d{2}\)$/, '') }} href={ctx.href}
            lead={<Code kind="event">{parts ? `${parts.weekday.toUpperCase()} ${parts.month} ${parts.day}` : '—'}</Code>}
            detail={[past ? 'past' : null, time || null, node.brief?.where ?? null].filter(part => part && !/^[-–—\s]*$/.test(part)).join(' · ') || undefined} />
        );
      }} />
    </div>
  );
}

function contactActions(row: Record<string, unknown>) {
  const email = text(row.email);
  const phone = text(row.phone);
  return (
    <>
      {email && <Action kind="mail" href={`mailto:${email}`}>{email}</Action>}
      {phone && <Action kind="phone" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</Action>}
    </>
  );
}

/** Headed text from the node's own web pages, the way its site words it. */
function PageSections({ rows, first = 4 }: { rows: Array<Record<string, unknown>>; first?: number }) {
  const sections = rows.flatMap(row => (Array.isArray(row.sections) ? row.sections : []).map(section => ({
    heading: text(record(section).heading), text: text(record(section).text), url: text(row.url),
  }))).filter(section => section.text);
  if (!sections.length) return null;
  return (
    <Box title="From its web pages" note={`${sections.length} sections`}>
      <div className="space-y-3">
        <More items={sections} first={first} label="more sections" render={(section, index) => (
          <div key={index} className="text-sm">
            {section.heading && <p className="font-semibold text-zinc-200">{section.heading}</p>}
            <Prose>{section.text}</Prose>
          </div>
        )} />
      </div>
      {sections[0].url && <Source>{shortUrl(sections[0].url)}</Source>}
    </Box>
  );
}

export function BuildingCard({ ctx }: { ctx: CardContext }) {
  const { read, href } = ctx;
  const inside = linked(read, 'in', 'located_at');
  const people = linked(read, 'in', 'office_at', 'person');
  const food = inside.filter(node => node.kind === 'venue');
  const kinds = [...new Set(inside.map(node => node.kind))];
  const details = firstRow(read, 'buildings');
  const places = rowsOf(read, 'map_places');
  const events = linked(read, 'in', ['held_in', 'located_at'], 'event');
  const parking = linked(read, 'in', 'near');
  const gaps = [...(events.length ? [] : ['events']), ...(parking.length ? [] : ['parking'])];
  const scalars = details ? Object.entries(details).filter(([, value]) => typeof value === 'string' || typeof value === 'number') : [];
  return (
    <CardLayout ctx={ctx} gaps={gaps}
      hero={(
        <Hero kind="building" title={read.node.label} visual={<Tile>🏛️</Tile>}
          subtitle={read.node.aliases?.length ? `Also called: ${read.node.aliases.join(', ')}` : undefined}>
          <Row>
            {kinds.map(kind => {
              const count = inside.filter(node => node.kind === kind).length;
              const word = kind === 'venue' ? 'place to eat' : kind.replace(/_/g, ' ');
              return <Badge key={kind} tone="amber">{count} {count === 1 ? word : kind === 'venue' ? 'places to eat' : plural(word)}</Badge>;
            })}
            <Badge>{people.length} faculty offices</Badge>
          </Row>
        </Hero>
      )}
      main={(
        <>
          <Box title="Inside this building" note={inside.length}>
            {inside.length === 0 ? <Empty title="Nothing linked inside yet" /> : (
              <div className="flex flex-col gap-0.5">
                {inside.map(node => <NodeRow key={node.id} node={node} href={href} highlight={node.kind === 'venue'}
                  lead={<span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: kindColor(node.kind) }} />}
                  detail={node.kind === 'venue' ? 'Food · open its card for today’s menu and hours' : node.kind.replace(/_/g, ' ')} />)}
              </div>
            )}
          </Box>
          {food.length > 0 && (
            <Box title="Food here" note={food.length}>
              <Chips>{food.map(node => <NodeChip key={node.id} node={node} href={href} detail="menu →" />)}</Chips>
            </Box>
          )}
          {places.length > 0 && (
            <Box title="On the campus map" note={places.length}>
              <ul className="space-y-1 text-sm text-zinc-300">
                <More items={places} first={12} label="more places" render={(place, index) => <li key={index}>{text(place.name) ?? text(place.title) ?? JSON.stringify(place)}</li>} />
              </ul>
            </Box>
          )}
          <Box title="Faculty offices here" note={people.length}>
            {people.length ? <Chips><More items={people} first={30} label="more people" render={node => <NodeChip key={node.id} node={node} href={href} photo />} /></Chips>
              : <Empty title="No faculty offices linked" />}
          </Box>
        </>
      )}
      side={(
        <>
          <Box title="Building details">
            {scalars.length ? <Facts items={scalars.map(([key, value]) => [key.replace(/_/g, ' '), String(value)])} />
              : <Empty title="Not in the graph yet">Hours, address and photo come with the buildings step (campus map).</Empty>}
          </Box>
          <Box title="Events here">
            {events.length ? <EventList nodes={events} ctx={ctx} /> : <Empty title="Not linked yet">Events name a room, but aren&apos;t linked to buildings yet.</Empty>}
          </Box>
        </>
      )} />
  );
}

export function DiningCard({ ctx }: { ctx: CardContext }) {
  const { read, href } = ctx;
  const contact = firstRow(read, 'contacts') ?? {};
  const hours = rowsOf(read, 'dining_hours');
  const menu = factsOf(read, 'menu');
  const documents = rowsOf(read, 'menu_documents');
  const buildings = linked(read, 'out', 'located_at');
  const intro = texts(rowsOf(read, 'office_sections').flatMap(row => (Array.isArray(row.sections) ? row.sections : [])
    .filter(section => text(record(section).heading)?.toLowerCase() === read.node.label.toLowerCase())
    .map(section => record(section).text)))[0];
  const todayLine = weekHours(hours, ctx.today).find(day => day.day === ctx.weekday);
  const meals = menu ? menuMeals(menu.rows) : [];
  // The meal being served now, else the next one today that has a menu.
  const names = new Map(meals.map(meal => [meal.name.toLowerCase(), meal.name]));
  const mealNow = menu?.date === ctx.today && todayLine
    ? hoursSpans(todayLine.schedule).filter(span => span.to > ctx.minutes)
      .map(span => names.get((span.label ?? '').toLowerCase())).find(Boolean) ?? null
    : null;
  const site = text(hours[0]?.canonical_url) ?? text(contact.canonical_url);
  return (
    <CardLayout ctx={ctx} gaps={buildings.length ? [] : ['building']}
      hero={(
        <Hero kind="venue" label="Dining" title={read.node.label} visual={<Tile>🍽️</Tile>}
          subtitle={[read.node.aliases?.length ? `Also called: ${read.node.aliases.join(', ')}` : null, text(contact.department)].filter(Boolean).join(' · ')}>
          <Row><OpenBadge rows={hours} ctx={ctx} /></Row>
          <Row>
            {contactActions(contact)}
            {site && <Action kind="web" href={site}>{shortUrl(site)}</Action>}
            {buildings.length ? buildings.map(node => <NodeChip key={node.id} node={node} href={href} />)
              : <MissingAction>Building: not linked yet</MissingAction>}
          </Row>
        </Hero>
      )}
      main={(
        <>
          <Box title="Menu" note={menu ? `${menu.total} dishes over ${menu.dates?.length ?? 1} days` : undefined}>
            {menu && menu.dates ? (
              <MenuView meals={meals} initialMeal={mealNow}
                days={menu.dates.map(day => {
                  const parts = dayParts(day);
                  return { day, label: `${parts.weekday} ${parts.month.charAt(0)}${parts.month.slice(1).toLowerCase()} ${parts.day}`, href: ctx.dayHref(day), current: day === menu.date };
                })} />
            ) : documents.length ? (
              <div className="space-y-2">
                <p className="text-sm text-zinc-400">This place posts its menu only as a file:</p>
                {documents.map((doc, index) => <Action key={index} kind="web" href={text(doc.url)}>{text(doc.title) ?? 'Menu'}</Action>)}
              </div>
            ) : <Empty title="No menu in the graph">This place doesn&apos;t publish a menu.</Empty>}
            {menu && site && <Source>{shortUrl(site)} menu</Source>}
          </Box>
          {intro && <Box title="About"><Prose>{intro}</Prose></Box>}
        </>
      )}
      side={(
        <>
          <Box title="Hours" note="this week"><HoursTable rows={hours} ctx={ctx} source={site} /></Box>
          <Box title="Building">
            {buildings.length ? <Chips>{buildings.map(node => <NodeChip key={node.id} node={node} href={href} />)}</Chips>
              : <Empty title="Not linked to a building yet">{text(contact.office) ? `Its directory entry says ${text(contact.office)}.` : null}</Empty>}
          </Box>
        </>
      )} />
  );
}

export function OfficeCard({ ctx }: { ctx: CardContext }) {
  const { read, href } = ctx;
  const contacts = rowsOf(read, 'contacts');
  const contact = contacts[0] ?? {};
  const hours = rowsOf(read, 'campus_hours');
  const buildings = linked(read, 'out', 'located_at');
  const events = linked(read, 'in', 'organized_by', 'event');
  const staff = linked(read, 'in', ['works_in', 'part_of'], 'person');
  const archway = firstRow(read, 'clubs');
  const listing = record(archway?.listing);
  const website = text(archway?.website_url);
  const room = text(contact.office);
  return (
    <CardLayout ctx={ctx} gaps={staff.length ? [] : ['staff']}
      hero={(
        <Hero kind={read.node.kind} title={read.node.label} visual={<Tile>{read.node.kind === 'facility' ? '🏋️' : '🏢'}</Tile>}
          subtitle={[room ? `Room ${room}` : null, text(contact.department) !== read.node.label ? text(contact.department) : null].filter(Boolean).join(' · ') || undefined}>
          <Row>
            <OpenBadge rows={hours} ctx={ctx} />
            {buildings.map(node => <NodeChip key={node.id} node={node} href={href} />)}
          </Row>
          <Row>
            {contactActions(contact)}
            {website && <Action kind="web" href={website}>{shortUrl(website)}</Action>}
            {text(listing.instagramUrl) && <Action kind="web" href={text(listing.instagramUrl)}>Instagram</Action>}
            {!buildings.length && <MissingAction>Building: not linked yet</MissingAction>}
          </Row>
        </Hero>
      )}
      main={(
        <>
          <Box title="Upcoming events" note={events.length ? `${events.length} · they link here` : undefined}>
            <EventList nodes={events} ctx={ctx} />
          </Box>
          {text(listing.mission) && <Box title="Mission"><Prose>{text(listing.mission)!.replace(/^Mission\s*/, '')}</Prose><Source>Archway</Source></Box>}
          <PageSections rows={rowsOf(read, 'office_sections')} />
          <Box title="Staff" note={staff.length || undefined}>
            {staff.length ? <Chips>{staff.map(node => <NodeChip key={node.id} node={node} href={href} photo />)}</Chips>
              : <Empty title="Not in the graph yet">Staff come with the office staff step.</Empty>}
          </Box>
        </>
      )}
      side={(
        <>
          <Box title="Hours"><HoursTable rows={hours} ctx={ctx} source={text(hours[0]?.canonical_url)} /></Box>
          {contacts.length > 0 && (
            <Box title="Contact" note={contacts.length > 1 ? `${contacts.length} entries` : undefined}>
              <div className="space-y-3">
                {contacts.map((row, index) => <Facts key={index} items={[['Email', text(row.email)], ['Phone', text(row.phone)], ['Room', text(row.office)], ['Note', text(row.contact_note)]]} />)}
              </div>
            </Box>
          )}
          {read.evidence_node && (
            <Link href={href(read.evidence_node)} prefetch={false} className="block text-sm text-sky-400 underline">
              Open the published evidence chat reads for this office
            </Link>
          )}
        </>
      )} />
  );
}

export function RouteCard({ ctx }: { ctx: CardContext }) {
  const { read } = ctx;
  const trips = rowsOf(read, 'shuttle_trips');
  const stops = rowsOf(read, 'shuttle_stops');
  const day = ctx.weekday === 'Saturday' ? 'saturday' : ctx.weekday === 'Sunday' ? 'sunday' : 'weekday';
  const runsToday = trips.some(trip => text(trip.service_day) === day);
  const page = text(trips[0]?.canonical_url) ?? text(stops[0]?.canonical_url);
  return (
    <CardLayout ctx={ctx}
      hero={(
        <Hero kind="route" label="Shuttle route" title={read.node.label} visual={<Tile>🚌</Tile>} subtitle={`${trips.length} trips · ${stops.length} stops`}>
          <Row>{runsToday ? <Badge tone="green">Runs today</Badge> : <Badge>Doesn&apos;t run today ({ctx.weekday})</Badge>}{page && <Action kind="web" href={page}>{shortUrl(page)}</Action>}</Row>
        </Hero>
      )}
      main={(
        <Box title="Trips" note={trips.length}>
          {trips.length === 0 ? <Empty title="No trips in the graph" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="text-xs text-zinc-500"><tr><th className="px-2 py-1.5">Day</th><th className="px-2">Leaves</th><th className="px-2">Stops</th><th className="px-2">Back</th></tr></thead>
                <tbody>
                  {trips.map((trip, index) => (
                    <tr key={index} className="border-t border-[#2a2a2a] align-top">
                      <td className="px-2 py-1.5 capitalize text-zinc-400">{text(trip.service_day)}</td>
                      <td className="px-2 py-1.5 font-semibold">{text(trip.departure)}</td>
                      <td className="px-2 py-1.5 text-zinc-300">{(Array.isArray(trip.stops) ? trip.stops : []).map(stop => `${text(record(stop).time) ?? ''} ${text(record(stop).location) ?? ''}`.trim()).join(' → ')}</td>
                      <td className="px-2 py-1.5">{text(trip.arrival)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Box>
      )}
      side={(
        <Box title="Stops" note={stops.length}>
          {stops.length === 0 ? <Empty title="No stops in the graph" /> : (
            <ul className="space-y-3 text-sm">
              {stops.map((stop, index) => (
                <li key={index}>
                  <p className="font-semibold">{text(stop.label) ?? text(stop.name)}</p>
                  {text(stop.pickup) && <p className="text-xs text-zinc-400">Pickup: {text(stop.pickup)}</p>}
                </li>
              ))}
            </ul>
          )}
        </Box>
      )} />
  );
}

export function TopicCard({ ctx }: { ctx: CardContext }) {
  const { read, href } = ctx;
  const topic = firstRow(read, 'campus_topics') ?? {};
  const handled = texts(topic.handled_by);
  const url = text(topic.url);
  const offices = linked(read, 'out', ['handled_by', 'refers_to']);
  return (
    <CardLayout ctx={ctx}
      hero={(
        <Hero kind="topic" title={read.node.label} visual={<Tile>💡</Tile>} subtitle={text(topic.status) === 'retired' ? 'No longer at Ramapo College' : 'A campus topic with no office of its own'}>
          {url && <Row><Action kind="web" href={url}>{shortUrl(url)}</Action></Row>}
        </Hero>
      )}
      main={(
        <Box title="What its page says">
          {text(topic.quote) ? <blockquote className="border-l-2 border-[#444] pl-3 text-sm text-zinc-300">“{text(topic.quote)}”</blockquote> : <Empty title="No quote in the graph" />}
          {text(topic.section) && <p className="mt-2 text-xs text-zinc-500">Section: {text(topic.section)}</p>}
          {url && <Source>{shortUrl(url)}{text(topic.checked_at) ? `, checked ${text(topic.checked_at)!.slice(0, 10)}` : ''}</Source>}
        </Box>
      )}
      side={(
        <>
          <Box title="Its page sends people to">
            {offices.length ? <Chips>{offices.map(node => <NodeChip key={node.id} node={node} href={href} />)}</Chips>
              : handled.length ? (
                <>
                  <ul className="space-y-1 text-sm">{handled.map(name => <li key={name}>{name}</li>)}</ul>
                  <p className="mt-2 text-xs text-amber-300">Named on the page, but not linked to office nodes yet.</p>
                </>
              ) : <Empty title="No offices named" />}
          </Box>
          {read.evidence_node && <Link href={href(read.evidence_node)} prefetch={false} className="block text-sm text-sky-400 underline">Open the published evidence chat reads for this topic</Link>}
        </>
      )} />
  );
}


