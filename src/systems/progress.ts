export const milestones = [
  'heard', 'manifest', 'footprints', 'locker', 'fuse', 'serviceCard', 'power', 'dispatch',
  'west', 'center', 'east', 'survey', 'triangulated', 'recorder', 'echo', 'override',
  'depth', 'dampers', 'chamber', 'transcript', 'reverse',
  'coastLog', 'tideBoard', 'feedKey', 'mast', 'caller',
] as const;
export type Milestone = typeof milestones[number];

export const archive = {
  berth: { title: 'The unmade bed', text: 'An extra bunk was bolted into Block B in August. No name was assigned. Someone has been folding its blanket every morning.' },
  photograph: { title: 'Six shadows', text: 'Five people stand beside the drill, but six shadows stretch across the snow. The date on the back is tomorrow.' },
  thermos: { title: 'Where the figures came from', text: 'Mara left a thermos here and wrote: “They never came out of the ice. They were already walking beside us when we arrived.”' },
  service: { title: 'Service bulletin 09', text: 'The vibration dampers were installed upside down on purpose. Someone wanted the station to hear the glacier.' },
  boot: { title: 'A familiar bootprint', text: 'The heel is worn in the same way as your left boot. The print runs backward into an undisturbed drift.' },
  cassette: { title: 'Cassette B', text: 'A child counts backward from nine. When the tape ends, the counting continues for another second.' },
  map: { title: 'The erased road', text: 'The relief map once showed a second route to the coast. The erased part is still warm to the touch.' },
  letter: { title: 'Mara’s unsent letter', text: '“If you hear me again, ask what I called the dog. If I answer, you’re listening to the wrong Mara. I never had a dog.”' },
  tag: { title: 'The torn name tag', text: 'A survival suit hangs in the boathouse, still wet from the sea. Its torn name tag is in the pocket. It reads VOSS.' },
} as const;
export type ArchiveId = keyof typeof archive;
export type Ending = 'seal' | 'send';
