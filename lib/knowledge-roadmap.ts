import type { KnowledgeRoadmap } from './knowledge-roadmap-types';

/**
 * What the bot may do with data at each level, and the knowledge it and its database hold to do it.
 * Written from the October 6, 2026 data audit (the per-office audit, the twelve domain analyses and
 * the two level studies). Progress is as of that date. Nothing here is read from the Brain.
 */
export const KNOWLEDGE_ROADMAP: KnowledgeRoadmap = {
  asOf: 'October 6, 2026',
  caveat:
    'There is no real student data yet. The bot has never been tested with students, and every test question was written by AI. The order below comes from what is already collected, what depends on what, and how risky each answer is. It does not come from what students ask. A survey of real students should reorder everything after level 1.',

  foundations: [
    {
      item: 'Refresh on a schedule',
      why: 'Each kind of data has a freshness window: events and dining 36 hours, the calendar and the directory 168 hours. Nothing re-collects them on a schedule today, so those answers would fail the freshness check.',
      progress: 'not_started',
    },
    {
      item: 'A source, a date and a validity window on every value',
      why: 'Built for office contacts and hours. Every new kind of record must carry the same three things before the bot may answer from it.',
      progress: 'built',
    },
    {
      item: 'One reader for every kind of record',
      why: 'The shared reader handles offices and their hours. Each new domain extends it under the same evidence rules, so no page or answer path picks its own winner.',
      progress: 'partial',
    },
    {
      item: 'Link page text to offices and topics',
      why: '24,419 passages of page text are stored and no office, club, building or person points at any of them. Level 2 needs this link, and so do several level 1 domains.',
      progress: 'not_started',
    },
    {
      item: 'Four answer behaviors',
      why: 'Answer, answer and route, route only, refuse. The Brain already behaves this way for office facts, emergencies and account requests. It is not yet written down as a rule every domain follows.',
      progress: 'partial',
    },
    {
      item: 'Test by question category, not by facts stored',
      why: 'Blind question sets per category with a grounding check. The method exists and has been used for offices only.',
      progress: 'partial',
    },
    {
      item: 'Learn what real students ask',
      why: 'The question headings the offices publish, a short survey of real Ramapo students, and counters that record which office and kind of answer without storing any question text.',
      progress: 'not_started',
    },
  ],

  levels: [
    {
      level: 1,
      name: 'Template answers',
      answerMadeBy: 'Code writes every sentence from a fixed template. The model only chooses which lookup to run.',
      whatTheBotDoes:
        'The bot returns facts exactly as its records hold them: contact details, hours, dates, menus, timetables, rooms. Code does the filtering and the arithmetic (is it open now, which items are vegan, how many days until the deadline, which term applies), and the sentence comes from a template. The same kind of question always gets the same shape of answer, with its source and date.',
      exampleQuestions: [
        "What is the Registrar's phone number?",
        'Is the library open right now?',
        "What is for dinner at Birch, and which items are vegan?",
        'What is the last day to drop a class without a W?',
        'When is the next shuttle to the train station?',
        'Which building is D-224 in?',
        "What are Professor Smith's office hours?",
      ],
      knowledge: [
        {
          type: 'Contact facts',
          examples: 'Email, phones, room and website of an office or person.',
          heldAs: 'One record per field, with the page section that states it',
        },
        {
          type: 'Weekly schedules',
          examples: 'Office, library and venue hours, seasonal windows, closings.',
          heldAs: 'A schedule record per named schedule, with its validity dates',
        },
        {
          type: 'Dated records',
          examples: 'Terms, add and drop and withdrawal deadlines, payment due dates, campus events.',
          heldAs: 'A record with the term and year read from the page, and an end time so it expires',
        },
        {
          type: 'Menus',
          examples: 'Dish, venue, date, meal, vegan and allergen flags.',
          heldAs: "One record per dish per meal, copied from the vendor's own data",
        },
        {
          type: 'Timetables',
          examples: 'Shuttle routes, stops and trips.',
          heldAs: 'Trip records with the days they run',
        },
        {
          type: 'Places',
          examples: 'Building, room-code prefix, floor, labs, printers, study rooms.',
          heldAs: 'Entities with located-at edges and quoted place statements',
        },
        {
          type: 'People',
          examples: 'Public contact, title, office and office hours as published.',
          heldAs: 'Person records with the profile section as evidence',
        },
        {
          type: 'Catalog facts',
          examples: 'Course title, credits, prerequisites, published program requirements.',
          heldAs: 'Structured catalog records',
        },
        {
          type: 'Computed views',
          examples: 'Open now, next trip, days until a deadline, which term applies.',
          heldAs: "Not stored: code computes them from the records and the turn's clock",
        },
      ],
      databaseMustHave: [
        'A source URL, a capture date and a validity window on every value.',
        'A freshness window per source, and a scheduled refresh that keeps it.',
        'A link from every record to its office, venue, event or person, each with its evidence.',
        'An empty value stays empty with a status of not found. A placeholder such as N/A is never a value.',
        'The term and year on every dated record, so an old calendar cannot leak into a new answer.',
        'Reviewed lists (aliases, rooms, service labels) that say who approved them.',
      ],
      howAnswersAreMade:
        'The model reads the question and picks a lookup and its parameters. Code reads the records through the shared reader, runs any calculation, and fills a fixed template. The model writes no campus fact and no sentence of the answer.',
      guardrails:
        'A fact is shown only with its source and capture date. A missing value says it is not published in the available evidence. Old data is labelled as a dated observation. The bot never says open now without the schedule, its dates and the time it used. Anything about a student\'s own record is routed, not answered.',
      domains: [
        {
          domain: 'Offices: contact, hours, routing',
          firstSlice:
            'Hours for the offices students are most likely to ask about, the office website, and a building for every office.',
          progress: 'partial',
          note:
            'All 34 offices answer with contact details, with no wrong value found in the audit. 9 have hours, and 4 more wait in unpublished commits. Website, building (16 of 34 are missing) and appointment text are not there yet.',
          size: 'M',
        },
        {
          domain: 'Calendar and deadlines',
          firstSlice:
            'Fix the six wrong-year rows, re-collect on a schedule, and publish term and deadline records the reader can answer from.',
          progress: 'not_started',
          note: 'The data is the cleanest in the pipeline, and 7 of 7 values checked against the Bursar page match. It is 6 days past its freshness window.',
          size: 'M',
        },
        {
          domain: 'Places',
          firstSlice:
            'A building projection that turns a room code into its building and reads where an office is.',
          progress: 'not_started',
          note: '16 buildings, 16 reviewed room prefixes and 220 person-to-building edges exist. The Brain reads none of them.',
          size: 'M',
        },
        {
          domain: 'Dining',
          firstSlice:
            'Venue hours and open now first, then the menu by date and meal with vegan and allergen flags.',
          progress: 'not_started',
          note: 'The vendor data is strong but 8 days old against a 36 hour window. Meal plan facts are page text, not records.',
          size: 'M',
        },
        {
          domain: 'Events, then clubs',
          firstSlice:
            'Start, end, place and organizer for the 317 events. Club profiles come after.',
          progress: 'not_started',
          note: 'Only 13 of 187 clubs have any link in the graph. Events go stale in 36 hours.',
          size: 'L',
        },
        {
          domain: 'People',
          firstSlice:
            'Public contact for the 205 active faculty, with office hours kept as their own sentence.',
          progress: 'not_started',
          note: 'The 21 retired people are withheld. Staff are almost absent from the graph.',
          size: 'M',
        },
        {
          domain: 'Courses and programs',
          firstSlice:
            'Course facts and the published requirements of each program. Never a personal degree audit.',
          progress: 'not_started',
          note: '3,344 courses and 134 programs are in the graph with prerequisites and requirement groups.',
          size: 'M',
        },
        {
          domain: 'Shuttle and parking timetables',
          firstSlice: 'The next trip from a stop, from the timetable records.',
          progress: 'not_started',
          note: '4 routes and 1,071 trips are stored and linked to nothing.',
          size: 'S',
        },
      ],
      needsFromEarlier: 'Level 0: the refresh loop, a reader that goes past offices, and the test method.',
      doneWhen:
        'In each domain every template field matches its source page on a blind audit with zero wrong values, the freshness check passes on an ordinary day, and an unknown is always shown as unknown.',
      exitTest:
        'For each category, a question set written by someone who has not seen the records. Every value in every answer is checked against its source, and one wrong value fails the level. Coverage is reported per category, not as a count of facts.',
    },
    {
      level: 2,
      name: 'Explain from documents',
      answerMadeBy: 'The model writes a short explanation, held to quoted passages. Code prints the quotes, links and dates.',
      whatTheBotDoes:
        "For a question that needs a policy or a procedure explained, the bot finds the right passages in the owning office's own pages and explains them in plain words. It quotes them, says which office owns the rule and when the page was captured. When the passages disagree, are out of date, or do not answer the question, it says so and routes the student to the office. A student's own case is always routed.",
      exampleQuestions: [
        'Explain the guest policy for the residence halls.',
        'How do I withdraw from a class, and what happens to my grade?',
        'What are my options for ordering a transcript, and what do they cost?',
        'How does the refund schedule work?',
        'What is the process to appeal a grade?',
      ],
      knowledge: [
        {
          type: 'Policy documents',
          examples: 'Housing rules, the conduct code, academic and billing policies.',
          heldAs: 'Page sections with an owner office, a capture date and an effective date or year',
        },
        {
          type: 'Procedures',
          examples: 'Transcripts, withdrawal, graduation application, parking permits.',
          heldAs: 'Verbatim sections owned by an office, with fees, deadlines and links pulled out as typed values',
        },
        {
          type: 'Question and answer pairs',
          examples: 'The 731 question headings the offices publish on their own pages.',
          heldAs: 'A question and the answer section under it',
        },
        {
          type: 'Page-to-topic links',
          examples: 'Which office and which topic a passage belongs to.',
          heldAs: 'Link records with their evidence',
        },
        {
          type: 'Version relations',
          examples: "This year's page replaces last year's.",
          heldAs: 'A supersedes link between document versions',
        },
      ],
      databaseMustHave: [
        'Every passage linked to its owning office and topic. This link does not exist today.',
        'Passages kept with their heading path, page URL, capture date and an effective date or academic year.',
        'Old-year and archive pages marked so they cannot be quoted as current.',
        'Duplicates removed, and conflicting passages flagged so the answer can say they conflict.',
        'Ordered lists kept as lists. List markers are lost in collection today.',
        'Typed values inside a passage (a fee, a deadline, a portal link) so code can compare them across pages.',
      ],
      howAnswersAreMade:
        'Code retrieves and orders the passages. The model writes a short explanation that uses only those passages. Code prints the quotes and sources itself. A second check confirms that every claim in the explanation is supported by a quoted passage, and the answer abstains when it is not.',
      guardrails:
        'No fact outside the quoted passages. Every explanation carries its source, date and owner. Conflicting or stale passages produce an abstain and a route to the office, not a guess. Rules with consequences (money, discipline, safety, Title IX) show the quote first and the explanation second. Sensitive areas are reviewed by a person who handles them before they open.',
      domains: [
        {
          domain: 'Procedures',
          firstSlice:
            'Twenty procedures, each a verbatim section of an office page plus its links and fees: transcript, withdraw from a class, declare a major, apply to graduate, replace an ID, get a parking permit.',
          progress: 'not_started',
          note: 'The text is collected. One section often holds several paths with different fees, so the answer must show all of them.',
          size: 'M',
        },
        {
          domain: 'Housing and campus rules',
          firstSlice: 'The guest policy, quiet hours and what a student may bring.',
          progress: 'not_started',
          note: 'This is the first example Dan gave. The corpus is being tested on it.',
          size: 'M',
        },
        {
          domain: 'Billing, refunds and aid rules',
          firstSlice: 'The refund schedule, fees and payment plans, with amounts read from records.',
          progress: 'not_started',
          note: 'Dates and amounts come from level 1 records, never from the model.',
          size: 'M',
        },
        {
          domain: 'Academic policies',
          firstSlice: 'Withdrawal, probation and grade appeals.',
          progress: 'not_started',
          size: 'M',
        },
        {
          domain: 'Conduct, Title IX and wellbeing',
          firstSlice: 'Quote-first answers only, reviewed by a person who handles these cases before they open.',
          progress: 'not_started',
          note: 'Emergency replies already exist and are separate from this.',
          size: 'L',
        },
      ],
      needsFromEarlier:
        'Level 0: the link from page text to offices and topics. Level 1: calendar, fee and deadline records, so the dates and amounts in an explanation come from records.',
      doneWhen:
        'A blind set of policy questions is answered with every claim supported by a quoted passage. Conflicting or out-of-date sources produce an abstain, and no explanation states a fact that is not in its quotes.',
      exitTest:
        'Blind policy questions per category, graded claim by claim by a support check, with a person reading a sample. Zero unsupported claims, and the agreed share of conflicting or stale cases abstain correctly.',
    },
    {
      level: 3,
      name: 'Combine',
      answerMadeBy: 'Code selects and joins the records and passages. The model explains the result and may rank only what code returned.',
      whatTheBotDoes:
        'Questions that need several facts together: which clubs match an interest and what they run this week, which classes can follow this one, which office to contact for a need and whether it is open right now, which dining hall is open with a vegan option. This level opens only if real student questions need it.',
      exampleQuestions: [
        'Any robotics clubs, and what events do they have this week?',
        'What can I take after Data Structures?',
        'Who handles accommodations, and are they open right now?',
        'Which dining spot is open late and has vegan food?',
      ],
      knowledge: [
        {
          type: 'Links across domains',
          examples: 'Events to clubs to buildings, offices to hours, courses to requirements.',
          heldAs: 'Graph edges with evidence',
        },
        {
          type: 'Interest search',
          examples: 'The mission and name of a club, matched on words.',
          heldAs: 'A search over club records that returns the matching sentence',
        },
        {
          type: 'Prerequisite and requirement structure',
          examples: 'What a course needs and what a program requires.',
          heldAs: 'Structured prerequisite and requirement-group records',
        },
      ],
      databaseMustHave: [
        'Edges between events, clubs, buildings and offices, each with its evidence.',
        'A search over club and event text that always returns the sentence it matched.',
        'Prerequisites and requirement groups that code can walk.',
        'A written scope for every absence answer: which sources were searched and when.',
      ],
      howAnswersAreMade:
        'Code runs the joins and filters, then hands the model only the items it found. The model writes a short explanation or an ordering of those items and adds nothing else. Code prints each item with its source.',
      guardrails:
        'Show the inputs that produced the answer. Never assume anything about the student. A search that finds nothing says what was searched and when, and does not say that none exists.',
      domains: [
        {
          domain: 'Interest search over clubs and events',
          firstSlice: 'Match words in a club mission and return the sentence that matched.',
          progress: 'not_started',
          size: 'L',
        },
        {
          domain: 'Course planning from published requirements',
          firstSlice: 'What can follow a course, from prerequisites. Never a personal degree audit.',
          progress: 'not_started',
          size: 'M',
        },
        {
          domain: 'Routing with open now',
          firstSlice: 'Who handles a need and whether that office is open now.',
          progress: 'not_started',
          size: 'S',
        },
      ],
      needsFromEarlier: 'Level 1 for each domain it combines, and level 2 where an explanation is needed.',
      doneWhen:
        'Each combined answer can show the records it used, and a blind set shows the same items come back when the question is asked in different words.',
      exitTest:
        'Blind combined questions, graded for completeness against the records and for any item that was not in the data. One invented item fails the level.',
    },
    {
      level: 4,
      name: 'Personal records',
      answerMadeBy: 'Not built. Today the bot routes the student to their own account.',
      whatTheBotDoes:
        "Answers about the student's own records: grade, balance, holds, schedule, degree audit. It is kept apart from everything above and comes last, if the college approves it at all.",
      exampleQuestions: ['What is my balance?', 'Do I have a hold?', 'What do I still need to graduate?'],
      knowledge: [
        {
          type: "A student's own records",
          examples: 'Grades, charges, holds, schedule, degree audit.',
          heldAs: 'A separate store behind sign-in, never mixed with public knowledge',
        },
      ],
      databaseMustHave: [
        'A separate store with per-student access and an audit log.',
        'No student text or record kept in the public knowledge store.',
        'The college\'s approval and a security review.',
      ],
      howAnswersAreMade:
        'Not decided. It would read only the signed-in student\'s own records and use level 1 templates.',
      guardrails:
        'Public RockyGPT never infers anyone\'s personal status. This level is outside the project today.',
      domains: [
        {
          domain: 'Sign-in and a student record connection',
          firstSlice: 'None planned. The bot routes the student to their own account.',
          progress: 'never',
          size: 'L',
        },
      ],
      needsFromEarlier: 'Everything above, plus the college\'s approval.',
      doneWhen: 'A security review passes and the college approves.',
      exitTest: 'A red-team set finds no way to read another student\'s record.',
    },
  ],

  notYet: [
    'Anything about a student\'s own records. The bot routes the student to their account.',
    'Explaining a policy before level 1 passes its exit test for offices.',
    'Live seat counts and live section schedules.',
    'Recommendations before level 3, and only if real student questions need them.',
    'The Athletics site and Berrie Center ticketing, which are outside ramapo.edu.',
    'Counting facts as progress. Progress is measured per question category.',
  ],
  decisions: [
    'Run a short survey of 15 to 30 real students, and approve counters that record only which office and what kind of answer, so the order after level 1 comes from real questions.',
    'Allow level 2: the model may write a short explanation held to quoted passages. This changes the current rule that the model writes no campus prose.',
    'Choose who reviews the copy for sensitive areas (a survivor of assault, Title IX, counseling) before level 2 opens there.',
    'Decide whether a scheduled daily refresh may publish to the dev release, since releases are batched today.',
    'Decide whether the dining vendor pages count as an official source.',
  ],
};
