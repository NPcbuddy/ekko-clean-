export enum MissionState {
  OPEN = "OPEN",
  ACCEPTED = "ACCEPTED",
  SUBMITTED = "SUBMITTED",
  VERIFIED = "VERIFIED",
  PAID = "PAID",
  REJECTED = "REJECTED",
}

type TransitionMap = {
  [from in MissionState]?: MissionState[];
};

const allowedTransitions: TransitionMap = {
  [MissionState.OPEN]: [MissionState.ACCEPTED],
  [MissionState.ACCEPTED]: [MissionState.SUBMITTED],
  [MissionState.SUBMITTED]: [MissionState.VERIFIED, MissionState.REJECTED],
  [MissionState.VERIFIED]: [MissionState.PAID],
  [MissionState.PAID]: [],
  [MissionState.REJECTED]: [],
};

export function canTransition(from: MissionState, to: MissionState): boolean {
  if (from === to) {
    return false;
  }

  const allowed = allowedTransitions[from];
  return allowed !== undefined && allowed.includes(to);
}

export function assertTransition(from: MissionState, to: MissionState): void {
  if (!canTransition(from, to)) {
    const allowed = allowedTransitions[from] || [];
    const allowedStr = allowed.length > 0 
      ? allowed.join(", ") 
      : "none (terminal state)";
    throw new Error(
      `Invalid transition from ${from} to ${to}. Allowed transitions from ${from}: ${allowedStr}`
    );
  }
}

