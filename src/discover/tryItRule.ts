// Where "Try it" opens a section: your own Ona when there's something of
// yours to look at (an account or any data), otherwise the demo.
export type TryItWhere = 'here' | 'real' | 'demo';

export function tryItDestination(state: { inDemo: boolean; signedIn: boolean; hasData: boolean }): TryItWhere {
  if (state.inDemo) return 'here'; // already in the demo: stay in it
  return state.signedIn || state.hasData ? 'real' : 'demo';
}
