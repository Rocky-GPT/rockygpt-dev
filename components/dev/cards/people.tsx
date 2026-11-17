import { type CardNode, firstRow, linked, profileCourses, record, rowsOf, shortUrl, text, texts, titleCase } from '@/lib/graph-cards';
import { type CardContext, CardLayout } from './layout';
import { Photo } from './Photo';
import {
  Action, Badge, Box, Chips, Code, Empty, Facts, Hero, MissingAction, More, NodeChip, NodeRow, Prose, Row,
  Source, SubHead,
} from './parts';

/** A person: a professor's card when the graph has their faculty profile, a contact card if not. */
export function PersonCard({ ctx }: { ctx: CardContext }) {
  return firstRow(ctx.read, 'faculty') ? <ProfessorCard ctx={ctx} /> : <ContactCard ctx={ctx} />;
}

function teaches(ctx: CardContext): CardNode[] {
  return linked(ctx.read, 'out', ['teaches_course', 'profile_course'], 'course');
}

function ProfessorCard({ ctx }: { ctx: CardContext }) {
  const { read, href } = ctx;
  const profile = record(firstRow(read, 'faculty')?.profile);
  const contact = firstRow(read, 'contacts') ?? {};
  const email = text(profile.email) ?? text(contact.email);
  const phone = text(profile.phone) ?? text(contact.phone);
  const room = text(profile.office) ?? text(contact.office);
  const building = linked(read, 'out', 'office_at')[0];
  const schools = linked(read, 'out', 'part_of', 'school');
  const page = text(profile.profileUrl);
  const courses = teaches(ctx);
  // The profile lists each course under its level; the links say which course node it is.
  const listed = new Map(profileCourses(texts(profile.courses)).map(course => [course.code.replace(/\s+/g, ' '), course]));
  const byLevel = new Map<string, CardNode[]>();
  for (const course of courses) {
    const level = listed.get(course.label.replace(/\s+/g, ' '))?.level ?? 'Courses';
    byLevel.set(level, [...byLevel.get(level) ?? [], course]);
  }
  const unlinked = (read.outgoing ?? []).filter(link => ['teaches_course', 'profile_course'].includes(link.type) && !link.node);
  const leads = linked(read, 'in', 'convener', 'program');
  const teachesIn = linked(read, 'in', 'listed_faculty', 'program').filter(program => !leads.some(lead => lead.id === program.id));
  const interests = texts(profile.researchInterests);
  const teaching = texts(profile.teachingInterests);
  const papers = texts(profile.publishedResearch);
  const education = texts(profile.education);
  const bio = text(profile.bio);

  return (
    <CardLayout ctx={ctx} gaps={['class times']}
      hero={(
        <Hero kind="person" label="Professor" title={read.node.label}
          visual={<Photo src={text(profile.imageUrl)} name={read.node.label} className="h-36 w-28 rounded-2xl border-2 border-[var(--k)] text-3xl" />}
          subtitle={text(profile.title) ?? text(contact.department)}>
          <Row>
            {schools.map(school => <NodeChip key={school.id} node={school} href={href} />)}
          </Row>
          <Row>
            {email && <Action kind="mail" href={`mailto:${email}`}>{email}</Action>}
            {phone && <Action kind="phone" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</Action>}
            {building ? <NodeChip node={building} href={href} detail={room ?? undefined} />
              : room ? <Action kind="place">{room}</Action> : <MissingAction>Office: not in the graph</MissingAction>}
            {page && <Action kind="web" href={page}>Profile on {shortUrl(page).split('/')[0]}</Action>}
          </Row>
        </Hero>
      )}
      main={(
        <>
          <Box title="Teaches" note={`${courses.length + unlinked.length} courses · from the profile page`}>
            {courses.length === 0 && unlinked.length === 0 && <Empty title="No courses linked">The profile page lists none, or they are not linked yet.</Empty>}
            {[...byLevel.entries()].map(([level, nodes]) => (
              <div key={level}>
                <SubHead>{level}</SubHead>
                <div className="flex flex-col gap-0.5">
                  {nodes.map(course => (
                    <NodeRow key={course.id} href={href}
                      node={{ ...course, label: listed.get(course.label.replace(/\s+/g, ' '))?.title || titleCase(course.brief?.title ?? course.label) }}
                      lead={<Code>{course.label}</Code>}
                      detail={course.brief?.credits ? `${course.brief.credits} credits` : undefined} />
                  ))}
                </div>
              </div>
            ))}
            {unlinked.length > 0 && (
              <p className="mt-2 text-xs text-amber-300">
                Not in the catalog, so no card: {unlinked.map(link => link.record?.source_record_key).join(', ')}
              </p>
            )}
            <div className="mt-3">
              <Empty title="This semester's class times and rooms: not in the graph yet">They come with the class sections step (section, days, time, room).</Empty>
            </div>
          </Box>
          {(interests.length > 0 || papers.length > 0 || education.length > 0 || teaching.length > 0 || bio) && (
            <Box title="Research and background" note="from the profile page">
              {interests.length > 0 && <div className="mb-3 flex flex-wrap gap-2">{interests.map(item => <Badge key={item} tone="sky">{item}</Badge>)}</div>}
              {papers.length > 0 && (
                <>
                  <SubHead>Published research ({papers.length})</SubHead>
                  <ul className="space-y-2 text-[13px] text-zinc-300">
                    <More items={papers} first={6} label="more papers" render={(paper, index) => <li key={index}>📄 {paper}</li>} />
                  </ul>
                </>
              )}
              {teaching.length > 0 && (<><SubHead>Teaching interests</SubHead><Prose>{teaching.join(' · ')}</Prose></>)}
              {education.length > 0 && (
                <>
                  <SubHead>Education</SubHead>
                  <ul className="space-y-1 text-[13px] text-zinc-300">{education.map(item => <li key={item}>🎓 {item}</li>)}</ul>
                </>
              )}
              {bio && (<><SubHead>About</SubHead><Prose>{bio}</Prose></>)}
              {page && <Source>{shortUrl(page)}</Source>}
            </Box>
          )}
        </>
      )}
      side={(
        <>
          <Box title="Programs" note={leads.length + teachesIn.length}>
            {leads.length + teachesIn.length === 0 && <Empty title="No programs linked yet" />}
            {leads.length > 0 && (<><SubHead>Leads (convener)</SubHead><Chips>{leads.map(node => <NodeChip key={node.id} node={node} href={href} />)}</Chips></>)}
            {teachesIn.length > 0 && (
              <>
                <SubHead>Teaches in</SubHead>
                <Chips><More items={teachesIn} first={8} label="more" render={node => <NodeChip key={node.id} node={node} href={href} />} /></Chips>
              </>
            )}
          </Box>
          <Box title="Office hours">
            <Empty title="Not in the graph">Faculty profile pages don&apos;t list office hours.</Empty>
          </Box>
        </>
      )} />
  );
}

function ContactCard({ ctx }: { ctx: CardContext }) {
  const { read, href } = ctx;
  const contacts = rowsOf(read, 'contacts');
  const first = contacts[0] ?? {};
  const email = text(first.email);
  const phone = text(first.phone);
  const workplaces = [...linked(read, 'out', ['works_in', 'part_of'], 'office'), ...linked(read, 'out', 'part_of', 'organization')];
  const schools = linked(read, 'out', 'part_of', 'school');
  const building = linked(read, 'out', 'office_at')[0];
  const page = text(first.canonical_url) ?? text(first.source_url);
  const gaps = [...(workplaces.length ? [] : ['works in']), ...(building ? [] : ['building'])];
  return (
    <CardLayout ctx={ctx} gaps={gaps}
      hero={(
        <Hero kind="person" label="Contact" title={read.node.label}
          visual={<Photo name={read.node.label} className="h-24 w-24 rounded-3xl border-2 border-[var(--k)] text-3xl" />}
          subtitle={text(first.title) ?? text(first.department)}>
          <Row>
            {email && <Action kind="mail" href={`mailto:${email}`}>{email}</Action>}
            {phone && <Action kind="phone" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</Action>}
            {!email && !phone && <MissingAction>No email or phone in the graph</MissingAction>}
          </Row>
        </Hero>
      )}
      main={(
        <>
          <Box title="Contact details" note={contacts.length > 1 ? `${contacts.length} directory entries` : 'from the directory'}>
            {contacts.length === 0 && <Empty title="No directory entry in the graph" />}
            <div className="space-y-4">
              {contacts.map((row, index) => (
                <Facts key={index} items={[
                  ['Department', text(row.department)],
                  ['Title', text(row.title)],
                  ['Email', text(row.email)],
                  ['Phone', texts((row.phones as unknown[] | undefined)?.map(item => record(item).number)).join(', ') || text(row.phone)],
                  ['Room', text(row.office) ?? <span className="text-zinc-500">Not listed</span>],
                  ['Note', text(row.contact_note)],
                ]} />
              ))}
            </div>
            {page && <Source>{shortUrl(page)}</Source>}
          </Box>
          <Box title="Works in">
            {workplaces.length || schools.length
              ? <Chips>{[...workplaces, ...schools].map(node => <NodeChip key={node.id} node={node} href={href} />)}</Chips>
              : <Empty title="Not linked to an office yet">{text(first.department) ? `The directory says "${text(first.department)}", but there is no link to an office node yet.` : null}</Empty>}
          </Box>
        </>
      )}
      side={(
        <>
          <Box title="Building">
            {building ? <NodeChip node={building} href={href} /> : <Empty title="Not linked to a building yet">{text(first.office) ? `The directory gives room ${text(first.office)}.` : 'The directory gives no room.'}</Empty>}
          </Box>
          <Box title="Photo and title">
            <Empty title="Not in the graph">Only faculty profile pages have photos.</Empty>
          </Box>
        </>
      )} />
  );
}

/** Used by other cards to show a person as a row with their photo. */
export function PersonRow({ node, ctx, detail }: { node: CardNode; ctx: CardContext; detail?: string }) {
  return (
    <NodeRow node={node} href={ctx.href} detail={detail ?? node.brief?.title}
      lead={<Photo src={node.brief?.image_url} name={node.label} className="h-12 w-10 rounded-lg text-sm" />} />
  );
}


