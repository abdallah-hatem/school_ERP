import { ShellNotFound } from '@/core/navigation/shell-not-found';

/**
 * Inside the shell: a record that doesn't exist, one outside the viewer's scope (the API answers
 * 404, edge case 3), or a page their roles can't open (`requirePermission`, R6). The same screen
 * for all three, so it never tells whether something exists. Only signed-in people reach the shell.
 */
export default function DashboardNotFound() {
  return <ShellNotFound />;
}
