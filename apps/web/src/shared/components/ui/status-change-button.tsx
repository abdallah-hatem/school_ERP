import { Button, type ButtonProps } from './button';
import { DeactivateIcon, ReactivateIcon } from './icons';

/**
 * The Deactivate / Reactivate pair (an employee's header, a user's page). They differ by more than
 * the words: deactivate takes something away (destructive outline, a user-minus), reactivate gives
 * it back (soft success, a user-check). Both still open a confirmation; the caller owns that.
 */
export function StatusChangeButton({
  change,
  children,
  ...props
}: Omit<ButtonProps, 'variant' | 'asChild'> & { change: 'deactivate' | 'reactivate' }) {
  const Icon = change === 'deactivate' ? DeactivateIcon : ReactivateIcon;
  return (
    <Button variant={change === 'deactivate' ? 'destructive-outline' : 'success-soft'} data-change={change} {...props}>
      <Icon />
      {children}
    </Button>
  );
}
