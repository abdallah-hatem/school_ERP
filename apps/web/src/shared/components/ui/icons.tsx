import type { Icon as PhosphorIcon, IconProps } from '@phosphor-icons/react';
import {
  ArrowClockwiseIcon as ArrowClockwise,
  CalendarBlankIcon as CalendarBlank,
  CaretDoubleLeftIcon as CaretDoubleLeft,
  CaretDoubleRightIcon as CaretDoubleRight,
  CaretDownIcon as CaretDown,
  CaretLeftIcon as CaretLeft,
  CaretRightIcon as CaretRight,
  CheckIcon as Check,
  CheckCircleIcon as CheckCircle,
  ClockIcon as Clock,
  GavelIcon as Gavel,
  HourglassIcon as Hourglass,
  ListIcon as List,
  MagnifyingGlassIcon as MagnifyingGlass,
  ProhibitIcon as Prohibit,
  SlidersHorizontalIcon as SlidersHorizontal,
  SquaresFourIcon as SquaresFour,
  TrayIcon as Tray,
  UsersThreeIcon as UsersThree,
  WalletIcon as Wallet,
  WarningCircleIcon as WarningCircle,
  XIcon as X,
} from '@phosphor-icons/react/ssr';
import type { ComponentType } from 'react';

/*
 * The one place the icon set lives (DESIGN.md → Icons): Phosphor, duotone by default. Screens
 * import icons from here, never from the package, so the set and weight change in one file.
 * The SSR build works in server and client components alike.
 */
export type AppIcon = ComponentType<IconProps>;

function duotone(Base: PhosphorIcon, name: string): AppIcon {
  function DuotoneIcon(props: IconProps) {
    return <Base weight="duotone" aria-hidden="true" focusable="false" {...props} />;
  }
  DuotoneIcon.displayName = `${name}Icon`;
  return DuotoneIcon;
}

// Navigation
export const DashboardIcon = duotone(SquaresFour, 'Dashboard');
export const EmployeesIcon = duotone(UsersThree, 'Employees');
export const PenaltiesIcon = duotone(Gavel, 'Penalties');
export const LatenessIcon = duotone(Clock, 'Lateness');
export const PayrollIcon = duotone(Wallet, 'Payroll');
export const SettingsIcon = duotone(SlidersHorizontal, 'Settings');

// Chrome
export const MenuIcon = duotone(List, 'Menu');
export const CloseIcon = duotone(X, 'Close');
export const ChevronStartIcon = duotone(CaretLeft, 'ChevronStart');
export const ChevronEndIcon = duotone(CaretRight, 'ChevronEnd');
export const ChevronFirstIcon = duotone(CaretDoubleLeft, 'ChevronFirst');
export const ChevronLastIcon = duotone(CaretDoubleRight, 'ChevronLast');
export const ChevronDownIcon = duotone(CaretDown, 'ChevronDown');
export const CheckIcon = duotone(Check, 'Check');
export const SearchIcon = duotone(MagnifyingGlass, 'Search');
export const CalendarIcon = duotone(CalendarBlank, 'Calendar');
export const RetryIcon = duotone(ArrowClockwise, 'Retry');

// States
export const EmptyIcon = duotone(Tray, 'Empty');
export const ErrorIcon = duotone(WarningCircle, 'Error');
export const ReadyIcon = duotone(CheckCircle, 'Ready');
export const PendingIcon = duotone(Hourglass, 'Pending');
export const BlockedIcon = duotone(Prohibit, 'Blocked');
