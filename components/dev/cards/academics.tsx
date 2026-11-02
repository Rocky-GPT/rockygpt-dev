import { type CardNode, firstRow, linked, prerequisiteSteps, record, requirementGroups, rowsOf, shortUrl, text, texts, titleCase } from '@/lib/graph-cards';
import { type CardContext, CardLayout } from './layout';
import { PersonRow } from './people';
import { Action, Badge, Box, Chips, Code, Empty, Hero, More, NodeChip, NodeRow, Prose, Row, Source, SubHead, Tile } from './parts';

function courseNode(code: string, id: string | null, name?: string | null): CardNode {
  return { id: id ? `entity:${id}` : `name:course:${code}`, label: name ? `${code} ${titleCase(name)}` : code, kind: 'course' };
}

export function CourseCard({ ctx }: { ctx: CardContext }) {
  const { read, href } = ctx;
  const row = firstRow(read, 'courses') ?? {};
  const course = record(row.course);
  const code = text(course.code) ?? read.node.label;
  const name = text(course.name);
  const credits = text(course.credits);
  const school = text(course.school);
  const description = text(course.description);
  const url = text(row.url);
  const subjects = linked(read, 'in', 'includes_course', 'subject');
  const teachers = linked(read, 'in', ['teaches_course', 'profile_course'], 'person');
  const neededFor = linked(read, 'in', 'requires', 'program');
  const steps = prerequisiteSteps(course);
  const [subject, number] = code.split(/\s+/);
  return (
    <CardLayout ctx={ctx} gaps={['sections', ...(neededFor.length ? [] : ['needed for'])]}
      hero={(
        <Hero kind="course" title={name ? titleCase(name) : code}
          visual={<Tile small>{subject}<br />{number}</Tile>}
          subtitle={[code, credits && `${credits} credits`, school && `School of ${school}`].filter(Boolean).join(' · ')}>
          <Row>
            {texts(course.attributes).map(attribute => <Badge key={attribute} tone="green">{titleCase(attribute)}</Badge>)}
            {subjects.map(node => <NodeChip key={node.id} node={node} href={href} detail="subject" />)}
          </Row>
          {url && <Row><Action kind="web" href={url}>{shortUrl(url)}</Action></Row>}
        </Hero>
      )}
      main={(
        <>
          <Box title="What it's about">
            {description ? <Prose>{description}</Prose> : <Empty title="No description in the graph" />}
            {description && <Source>the course catalog</Source>}
          </Box>
          <Box title="Take these first" note={steps.length ? 'prerequisites · all of' : undefined}>
            {steps.length === 0 ? (
              <p className="text-sm text-zinc-400">{text(course.requisitesText) ?? 'The catalog lists no prerequisites.'}</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {steps.map((step, index) => (
                  <span key={index} className="flex flex-wrap items-center gap-2">
                    {index > 0 && <span className="font-bold text-zinc-600">+</span>}
                    {step.map((choice, at) => (
                      <span key={choice.code} className="flex items-center gap-2">
                        {at > 0 && <span className="text-xs text-zinc-500">or</span>}
                        <NodeChip node={courseNode(choice.code, null, choice.name)} href={href} />
                      </span>
                    ))}
                  </span>
                ))}
              </div>
            )}
            {steps.length > 0 && <p className="mt-3 text-xs text-zinc-500">Each course opens its own card, so you can walk back through the chain.</p>}
          </Box>
          <Box title="When and where it meets" note="this semester">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-zinc-500"><tr>{['Section', 'Days', 'Time', 'Room', 'Professor'].map(head => <th key={head} className="border-b border-[#333] px-2 py-1.5 font-semibold">{head}</th>)}</tr></thead>
                <tbody><tr className="text-zinc-600">{Array.from({ length: 5 }, (_, index) => <td key={index} className="px-2 py-2">—</td>)}</tr></tbody>
              </table>
            </div>
            <div className="mt-3"><Empty title="Class sections are not in the graph yet">They come with the class sections step. Until then this table stays empty.</Empty></div>
          </Box>
        </>
      )}
      side={(
        <>
          <Box title="Who teaches it" note={teachers.length || undefined}>
            {teachers.length
              ? <div className="flex flex-col gap-1">{teachers.map(node => <PersonRow key={node.id} node={node} ctx={ctx} detail="Lists it on their profile page" />)}</div>
              : <Empty title="No one linked yet">No faculty profile lists this course.</Empty>}
          </Box>
          <Box title="Needed for" note={neededFor.length || undefined}>
            {neededFor.length
              ? <Chips>{neededFor.map(node => <NodeChip key={node.id} node={node} href={href} />)}</Chips>
              : <Empty title="Not linked to programs yet">Programs list their required courses, but those aren&apos;t links yet.</Empty>}
          </Box>
        </>
      )} />
  );
}

export function ProgramCard({ ctx }: { ctx: CardContext }) {
  const { read, href } = ctx;
  const row = firstRow(read, 'programs') ?? {};
  const leaders = linked(read, 'out', 'convener', 'person');
  const faculty = linked(read, 'out', 'listed_faculty', 'person');
  const schools = linked(read, 'out', 'part_of', 'school');
  const groups = requirementGroups(rowsOf(read, 'requirement_groups'));
  const description = text(row.description);
  const kind = text(row.program_kind);
  const plans = rowsOf(read, 'graduation_plans');
  return (
    <CardLayout ctx={ctx} gaps={leaders.length ? [] : ['leader']}
      hero={(
        <Hero kind="program" label={`Program${kind ? ` · ${kind}` : ''}`} title={read.node.label} visual={<Tile>🎓</Tile>}
          subtitle={[text(row.degree), read.node.aliases?.length ? `also: ${read.node.aliases.join(', ')}` : null].filter(Boolean).join(' · ')}>
          <Row>
            {schools.map(node => <NodeChip key={node.id} node={node} href={href} />)}
            {groups.length > 0 && <Badge>{groups.length} requirement groups</Badge>}
            {faculty.length > 0 && <Badge>{faculty.length} faculty</Badge>}
          </Row>
        </Hero>
      )}
      main={(
        <>
          <Box title="About">
            {description ? (
              <details>
                <summary className="cursor-pointer list-none text-sm leading-relaxed text-zinc-300">
                  {description.length > 360 ? <>{description.slice(0, 360)}… <span className="text-sky-400">Read more</span></> : description}
                </summary>
                {description.length > 360 && <Prose>{description.slice(360)}</Prose>}
              </details>
            ) : <Empty title="No description in the graph" />}
            {description && <Source>the course catalog</Source>}
          </Box>
          <Box title="What you take" note={`${groups.length} groups`}>
            {groups.length === 0 && <Empty title="No requirements in the graph" />}
            {groups.map((group, index) => (
              <div key={`${group.label}-${index}`} className={index ? 'mt-4' : undefined}>
                <SubHead>{group.label} · {group.choose}</SubHead>
                <Chips>
                  <More items={group.courses} first={10} label="more courses" render={course => (
                    <NodeChip key={`${course.code}-${course.id}`} node={courseNode(course.code, course.id)} href={href}
                      detail={course.name ? titleCase(course.name) : undefined} />
                  )} />
                </Chips>
              </div>
            ))}
          </Box>
          {plans.length > 0 && (
            <Box title="Graduation plan" note={`${plans.length} rows`}>
              <p className="text-sm text-zinc-400">The catalog&apos;s suggested plan is in the raw rows below.</p>
            </Box>
          )}
        </>
      )}
      side={(
        <>
          <Box title="Led by">
            {leaders.length
              ? <div className="flex flex-col gap-1">{leaders.map(node => <PersonRow key={node.id} node={node} ctx={ctx} detail="Convener" />)}</div>
              : <Empty title="No convener linked" />}
          </Box>
          <Box title="Faculty" note={faculty.length}>
            {faculty.length
              ? <Chips><More items={faculty} first={24} label="more" render={node => <NodeChip key={node.id} node={node} href={href} photo />} /></Chips>
              : <Empty title="No faculty linked" />}
          </Box>
        </>
      )} />
  );
}

export function SubjectCard({ ctx }: { ctx: CardContext }) {
  const { read, href } = ctx;
  const courses = linked(read, 'out', 'includes_course', 'course');
  const missing = (read.outgoing ?? []).filter(link => link.type === 'includes_course' && !link.node);
  const code = read.node.aliases?.find(alias => /^[A-Z]{2,5}$/.test(alias)) ?? /\(([A-Z]{2,5})\)/.exec(read.node.label)?.[1];
  return (
    <CardLayout ctx={ctx}
      hero={<Hero kind="subject" title={read.node.label} visual={<Tile small>{code ?? '📚'}</Tile>} subtitle={`${courses.length} courses in the catalog`} />}
      main={(
        <Box title="Courses" note={courses.length + missing.length}>
          <div className="flex flex-col gap-0.5">
            <More items={courses} first={40} label="more courses" render={course => (
              <NodeRow key={course.id} node={{ ...course, label: titleCase(course.brief?.title ?? course.label) }} href={href}
                lead={<Code>{course.label}</Code>} detail={course.brief?.credits ? `${course.brief.credits} credits` : undefined} />
            )} />
          </div>
          {missing.length > 0 && <p className="mt-2 text-xs text-amber-300">{missing.length} listed with no course node: {missing.map(link => link.record?.source_record_key).join(', ')}</p>}
        </Box>
      )} />
  );
}

export function SchoolCard({ ctx }: { ctx: CardContext }) {
  const { read, href } = ctx;
  const programs = linked(read, 'in', 'part_of', 'program');
  const people = linked(read, 'in', 'part_of', 'person');
  const clubs = rowsOf(read, 'clubs');
  return (
    <CardLayout ctx={ctx}
      hero={(
        <Hero kind="school" title={read.node.label} visual={<Tile>🏫</Tile>}
          subtitle={read.node.aliases?.length ? `Also called: ${read.node.aliases.join(', ')}` : undefined}>
          <Row><Badge tone="sky">{programs.length} programs</Badge><Badge>{people.length} people</Badge></Row>
        </Hero>
      )}
      main={(
        <>
          <Box title="Programs" note={programs.length}>
            {programs.length ? <Chips>{programs.map(node => <NodeChip key={node.id} node={node} href={href} />)}</Chips> : <Empty title="No programs linked" />}
          </Box>
          {clubs.length > 0 && (
            <Box title="Archway groups" note={clubs.length}>
              <ul className="space-y-1 text-sm text-zinc-300">{clubs.map((club, index) => <li key={index}>{text(club.name)}{text(club.category) ? <span className="text-zinc-500"> · {text(club.category)}</span> : null}</li>)}</ul>
            </Box>
          )}
        </>
      )}
      side={(
        <Box title="People" note={people.length}>
          {people.length ? <Chips><More items={people} first={30} label="more people" render={node => <NodeChip key={node.id} node={node} href={href} photo />} /></Chips> : <Empty title="No people linked" />}
        </Box>
      )} />
  );
}
