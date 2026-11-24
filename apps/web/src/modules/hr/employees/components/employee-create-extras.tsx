'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * What "Add employee" runs right after the employee is saved, for a part of the form another module
 * owns (the contracts module's signed contract, placed by the route as `contractExtra`). Resolves
 * true when it all went through; false keeps the employee saved and opens their Contracts tab
 * (unless the photo already needs the edit page). The part says what went wrong itself.
 */
export type AfterCreate = (employeeId: string) => Promise<boolean>;

export interface EmployeeCreateExtras {
  /** The form is saving: the part's controls wait. */
  disabled: boolean;
  /** The part's after-create step, or null when it has nothing to do. */
  setAfterCreate: (run: AfterCreate | null) => void;
}

const Context = createContext<EmployeeCreateExtras>({ disabled: false, setAfterCreate: () => undefined });

export function EmployeeCreateExtrasProvider({ value, children }: { value: EmployeeCreateExtras; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** For a part placed in the add-employee form (`contractExtra`): the form's state and its after-create hook. */
export function useEmployeeCreateExtras(): EmployeeCreateExtras {
  return useContext(Context);
}
