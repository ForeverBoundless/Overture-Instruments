/*
 * The launch experience uses Google's Material Web implementation instead
 * of hand-rolled imitation controls.  The synth itself intentionally keeps
 * bespoke controls: a generic button/slider kit cannot reproduce the
 * physical Little Phatty panel's interaction and proportions.
 */
import './launcher.js';

// Enhancement only: the catalog remains functional if the CDN is offline.
// The custom element's text still presents a usable Launch control while
// Material Web upgrades it whenever the library is available.
import('https://esm.sh/@material/web@2.4.1/button/filled-button.js').catch(() => {});
