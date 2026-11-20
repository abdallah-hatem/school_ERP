import { RunLines, type RunLinesProps } from '../components/run-page';
import { RunShell, type RunShellProps } from '../components/run-shell';
import { runFilterCount } from '../lib/run-query';

export interface RunPageProps extends Omit<RunShellProps, 'children'>, Omit<RunLinesProps, 'filtered'> {}

/**
 * The run layout and its Employees tab in one tree, as the routes render them: the layout's run,
 * and the same run as the tab's filtered read when the query filters.
 */
export function RunPage({ settingsHref, departments, query, ...shell }: RunPageProps) {
  return (
    <RunShell {...shell}>
      <RunLines
        basePath={shell.basePath}
        settingsHref={settingsHref}
        departments={departments}
        query={query}
        filtered={runFilterCount(query) > 0 ? { run: shell.run, asOf: shell.asOf } : null}
      />
    </RunShell>
  );
}
