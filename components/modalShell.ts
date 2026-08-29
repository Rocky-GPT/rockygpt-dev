/**
 * The overlay every modal in this app centres its panel in.
 *
 * The student app's version reads the visible viewport band from CSS variables
 * — `--viewport-top` and `--viewport-height` — so a panel re-centres above an
 * on-screen keyboard. That machinery lives in `lib/visual-viewport`, which is
 * not lifted here: this is a desktop tool, and carrying the class without the
 * code that publishes those variables would encode a mechanism that does not
 * exist. `inset-0` says what it actually does.
 *
 * `animate-in fade-in` is likewise gone. It needs `tailwindcss-animate`, which
 * is installed in neither app, so it has always been an inert class name.
 */
export const MODAL_OVERLAY =
  'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm';
