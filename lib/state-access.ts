import type { AppState } from "./schedule";

type StateWithSensitiveGuards = {
  lifeguards: { id: string; name: string; pin: string }[];
  requests: { name: string; status: string }[];
  shifts: { assignments: { name: string; source?: string; lead?: boolean }[] }[];
};

function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function anonymousShifts<T extends { assignments: { name: string; source?: string; lead?: boolean }[] }>(shifts: T[]): T[] {
  return shifts.map((shift) => ({
    ...shift,
    assignments: shift.assignments.map((assignment, index) => ({
      ...assignment,
      name: `Scheduled ${index + 1}`,
    })),
  }));
}

export function anonymousState(state: AppState): AppState {
  return {
    ...state,
    lifeguards: [],
    requests: [],
    shifts: anonymousShifts(state.shifts),
  };
}

export function guardState(state: AppState, guardName: string): AppState {
  return {
    ...state,
    lifeguards: [],
    requests: state.requests.filter((request) => sameName(request.name, guardName)),
  };
}

export function legacyAnonymousState<T extends StateWithSensitiveGuards>(state: T): T {
  return {
    ...state,
    lifeguards: [],
    requests: [],
    shifts: anonymousShifts(state.shifts),
  };
}
