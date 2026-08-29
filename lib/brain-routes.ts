/**
 * @module lib/brain-routes
 * The brain paths this app is allowed to reach.
 *
 * Kept here rather than beside the handlers that use them because a Next route
 * module may only export handler names — anything else fails the build — and
 * the pages need these lists too.
 */

/**
 * Published artifacts, mirroring the brain's own `PUBLIC_ARTIFACTS`.
 *
 * Duplicated deliberately: an unknown key is then a 404 from this app rather
 * than a round trip that ends in one. Note the brain holds more artifacts than
 * these — `faculty`, `menu-week` and others exist but are reachable only
 * through the shaped routes below.
 */
export const ARTIFACTS = ['calendar', 'clubs', 'courses', 'events', 'hours', 'programs'] as const;

/** The shaped campus routes the student app consumes directly. */
export const UI_ROUTES = [
  'directory',
  'map',
  'shuttle',
  'menu',
  'menu/browse',
  'dining-hours',
] as const;

export const ARTIFACT_SET: ReadonlySet<string> = new Set(ARTIFACTS);
export const UI_ROUTE_SET: ReadonlySet<string> = new Set(UI_ROUTES);
