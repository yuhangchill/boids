// Curated English trait lexicons.
//
// These words are embedded and matched (by proximity to each band's centroid) to
// give every group its trait vocabulary, and then matched to the rule library to
// select and weight rules. Per PROJECT_BRIEF section 6a:
//
//   - RELATIONSHIP words are the PRIMARY input: how members relate to one another
//     and how groups relate. They carry most of the weight in rule selection.
//   - MOTION words are SECONDARY: a cross-check on the emergent result. They inform
//     tendency, never a scripted animation.
//
// Keep these as vocabularies, not switches. Nothing here scripts movement; the
// words only bias which abstract rules get composed and how strongly.

export const RELATIONSHIP_WORDS: readonly string[] = [
  'tight-knit',
  'cohesive',
  'gregarious',
  'sociable',
  'coordinated',
  'synchronized',
  'unified',
  'orderly',
  'clustered',
  'schooling',
  'swarming',
  'cooperative',
  'hierarchical',
  'leader-following',
  'territorial',
  'competitive',
  'aggressive',
  'scattered',
  'dispersed',
  'loose',
  'fragmented',
  'chaotic',
  'disorderly',
  'restless',
  'skittish',
  'solitary',
  'independent',
  'aloof',
];

export const MOTION_WORDS: readonly string[] = [
  'gliding',
  'soaring',
  'drifting',
  'floating',
  'darting',
  'flitting',
  'scurrying',
  'scuttling',
  'wheeling',
  'circling',
  'milling',
  'undulating',
  'weaving',
  'hovering',
  'bounding',
  'surging',
  'pulsing',
  'creeping',
  'crawling',
  'writhing',
  'twitching',
  'lurching',
];
