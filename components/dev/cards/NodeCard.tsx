import type { ComponentType } from 'react';
import { CourseCard, ProgramCard, SchoolCard, SubjectCard } from './academics';
import { CalendarDateCard, ClubCard, ClubCategoryCard, DefaultCard, EventCard, TermCard } from './happenings';
import type { CardContext } from './layout';
import { PersonCard } from './people';
import { BuildingCard, DiningCard, OfficeCard, RouteCard, StopCard, TopicCard } from './places';

export type { CardContext } from './layout';

/**
 * One card design per node type. To give a new type its own design, write a card from the shared
 * parts (parts.tsx, layout.tsx) and add one line here; until then it gets DefaultCard.
 */
export const CARDS: Record<string, ComponentType<{ ctx: CardContext }>> = {
  person: PersonCard,
  course: CourseCard,
  program: ProgramCard,
  subject: SubjectCard,
  school: SchoolCard,
  building: BuildingCard,
  venue: DiningCard,
  office: OfficeCard,
  facility: OfficeCard,
  club: ClubCard,
  organization: ClubCard,
  club_category: ClubCategoryCard,
  event: EventCard,
  term: TermCard,
  calendar_date: CalendarDateCard,
  route: RouteCard,
  stop: StopCard,
  topic: TopicCard,
};

export function NodeCard({ ctx }: { ctx: CardContext }) {
  const Card = CARDS[ctx.read.node.kind] ?? DefaultCard;
  return <Card ctx={ctx} />;
}
