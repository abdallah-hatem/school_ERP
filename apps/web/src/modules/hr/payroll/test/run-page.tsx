import { RunLines, type RunLinesProps } from '../components/run-page';
import { RunShell, type RunShellProps } from '../components/run-shell';
import { needsOwnLines } from '../lib/run-query';

export interface RunPageProps extends Omit<RunShellProps, 'children'>, Omit<RunLinesProps, 'filtered'> {}

/**
 * The run layout and its Employees tab in one tree, as the routes render them: the layout's run,
 * and the same run as the tab's own read when the query filters or pages.
 */
export function RunPage({ settingsHref, selectedDepartment, query, ...shell }: RunPageProps) {
  return (
    <RunShell {...shell}>
      <RunLines
        basePath={shell.basePath}
        settingsHref={settingsHref}
        selectedDepartment={selectedDepartment}
        query={query}
        filtered={needsOwnLines(query) ? { run: shell.run, asOf: shell.asOf } : null}
      />
    </RunShell>
  );
}
