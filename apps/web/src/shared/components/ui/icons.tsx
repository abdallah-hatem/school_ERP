import type { Icon as PhosphorIcon, IconProps } from '@phosphor-icons/react';
import {
  ArchiveIcon as Archive,
  ArrowClockwiseIcon as ArrowClockwise,
  ArrowCounterClockwiseIcon as ArrowCounterClockwise,
  ArrowsClockwiseIcon as ArrowsClockwise,
  BuildingsIcon as Buildings,
  CalculatorIcon as Calculator,
  ChalkboardTeacherIcon as ChalkboardTeacher,
  ClockAfternoonIcon as ClockAfternoon,
  PackageIcon as Package,
  SignOutIcon as SignOut,
  StudentIcon as Student,
  UsersIcon as Users,
  CalendarBlankIcon as CalendarBlank,
  CalendarPlusIcon as CalendarPlus,
  CoinsIcon as Coins,
  DotsThreeIcon as DotsThree,
  FileArrowDownIcon as FileArrowDown,
  FolderOpenIcon as FolderOpen,
  HandCoinsIcon as HandCoins,
  PlusMinusIcon as PlusMinus,
  PrinterIcon as Printer,
  ReceiptIcon as Receipt,
  SealCheckIcon as SealCheck,
  CaretDoubleLeftIcon as CaretDoubleLeft,
  CaretDoubleRightIcon as CaretDoubleRight,
  CaretDownIcon as CaretDown,
  CaretLeftIcon as CaretLeft,
  CaretRightIcon as CaretRight,
  CheckIcon as Check,
  CheckCircleIcon as CheckCircle,
  ClockIcon as Clock,
  ClockCounterClockwiseIcon as ClockCounterClockwise,
  EyeIcon as Eye,
  EyeSlashIcon as EyeSlash,
  GavelIcon as Gavel,
  HourglassIcon as Hourglass,
  ListIcon as List,
  ListBulletsIcon as ListBullets,
  MagnifyingGlassIcon as MagnifyingGlass,
  PencilSimpleIcon as PencilSimple,
  PlusIcon as Plus,
  ProhibitIcon as Prohibit,
  ScalesIcon as Scales,
  SlidersHorizontalIcon as SlidersHorizontal,
  SquaresFourIcon as SquaresFour,
  TrashIcon as Trash,
  TrayIcon as Tray,
  TreeStructureIcon as TreeStructure,
  UploadSimpleIcon as UploadSimple,
  UserCheckIcon as UserCheck,
  UserMinusIcon as UserMinus,
  UsersThreeIcon as UsersThree,
  WalletIcon as Wallet,
  WarningCircleIcon as WarningCircle,
  XIcon as X,
  FunnelIcon as Funnel,
  ArrowSquareOutIcon as ArrowSquareOut,
  SignInIcon as SignIn,
  LockKeyIcon as LockKey,
  PlusCircleIcon as PlusCircle,
  GearSixIcon as GearSix,
  ListMagnifyingGlassIcon as ListMagnifyingGlass,
  UserCircleIcon as UserCircle,
  XCircleIcon as XCircle,
  UserCircleGearIcon as UserCircleGear,
  ShieldCheckIcon as ShieldCheck,
  ShieldStarIcon as ShieldStar,
  KeyIcon as Key,
  LockSimpleIcon as LockSimple,
  CopyIcon as Copy,
  IdentificationCardIcon as IdentificationCard,
  SparkleIcon as Sparkle,
  EnvelopeSimpleIcon as EnvelopeSimple,
  UserPlusIcon as UserPlus,
  UserCircleDashedIcon as UserCircleDashed,
} from '@phosphor-icons/react/ssr';
import type { ComponentType } from 'react';
import { cn } from '@/shared/lib/utils';

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
/** One person list inside the HR module (the module itself is `HrModuleIcon`). */
export const StaffIcon = duotone(Users, 'Staff');
export const SignOutIcon = duotone(SignOut, 'SignOut');

// Modules (sidebar groups)
export const HrModuleIcon = duotone(UsersThree, 'HrModule');
export const AccountingModuleIcon = duotone(Calculator, 'AccountingModule');
export const InventoryModuleIcon = duotone(Package, 'InventoryModule');
export const StudentsModuleIcon = duotone(Student, 'StudentsModule');

// Employee facts
export const DepartmentIcon = duotone(Buildings, 'Department');
export const StageIcon = duotone(ChalkboardTeacher, 'Stage');
export const WorkSystemIcon = duotone(ClockAfternoon, 'WorkSystem');
/** A job title whose holders lead other staff (§3 direct managers). */
export const ManagesPeopleIcon = duotone(Users, 'ManagesPeople');

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

/**
 * The "add" mark on every Add / Create / Record button: a bold plus in a small soft rounded badge
 * (owner's pick, design/mockups/add-icons.html option 2). On a primary button the badge is a light
 * wash of the button's text colour; elsewhere a primary-soft tint.
 */
function AddBadge({ className, ...props }: IconProps) {
  return (
    <span
      aria-hidden="true"
      data-slot="add-badge"
      className={cn(
        'inline-grid size-6 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary',
        '[[data-variant=primary]_&]:bg-primary-foreground/18 [[data-variant=primary]_&]:text-current',
        className,
      )}
    >
      <Plus weight="bold" focusable="false" {...props} className="size-4" />
    </span>
  );
}
AddBadge.displayName = 'AddIcon';

// Actions
export const AddIcon: AppIcon = AddBadge;
/** The ⋯ that opens a row's actions. */
export const MoreIcon: AppIcon = function MoreIcon(props: IconProps) {
  return <DotsThree weight="bold" aria-hidden="true" focusable="false" {...props} />;
};
export const EditIcon = duotone(PencilSimple, 'Edit');
export const DeactivateIcon = duotone(UserMinus, 'Deactivate');
export const ReactivateIcon = duotone(UserCheck, 'Reactivate');
export const ShowIcon = duotone(Eye, 'Show');
export const HideIcon = duotone(EyeSlash, 'Hide');
export const RemoveIcon = duotone(Trash, 'Remove');
export const UploadIcon = duotone(UploadSimple, 'Upload');
export const RetireIcon = duotone(Archive, 'Retire');
export const RestoreIcon = duotone(ArrowCounterClockwise, 'Restore');
export const RecalculateIcon = duotone(ArrowsClockwise, 'Recalculate');
export const ExportIcon = duotone(FileArrowDown, 'Export');
export const ApproveIcon = duotone(SealCheck, 'Approve');
export const PrintIcon = duotone(Printer, 'Print');
export const AdjustIcon = duotone(PlusMinus, 'Adjust');
export const NewPeriodIcon = duotone(CalendarPlus, 'NewPeriod');

// Figures
export const GrossIcon = duotone(Coins, 'Gross');
export const DeductionsIcon = duotone(Receipt, 'Deductions');
export const NetPayIcon = duotone(HandCoins, 'NetPay');
export const PayslipIcon = duotone(Receipt, 'Payslip');
/** Open a record (a payroll run). */
export const OpenIcon = duotone(FolderOpen, 'Open');

// States
export const EmptyIcon = duotone(Tray, 'Empty');
export const ErrorIcon = duotone(WarningCircle, 'Error');
export const ReadyIcon = duotone(CheckCircle, 'Ready');
export const PendingIcon = duotone(Hourglass, 'Pending');
export const BlockedIcon = duotone(Prohibit, 'Blocked');

// Settings sections
export const SchoolIcon = duotone(Buildings, 'School');
export const StructureIcon = duotone(TreeStructure, 'Structure');
export const ListsIcon = duotone(ListBullets, 'Lists');
export const RulesIcon = duotone(Scales, 'Rules');
export const HistoryIcon = duotone(ClockCounterClockwise, 'History');

// Activity (audit log)
export const AdministrationModuleIcon = duotone(Buildings, 'AdministrationModule');
export const ActivityIcon = duotone(ClockCounterClockwise, 'Activity');
export const FilterIcon = duotone(Funnel, 'Filter');
export const OpenRecordIcon = duotone(ArrowSquareOut, 'OpenRecord');
export const SignInIcon = duotone(SignIn, 'SignIn');
export const FailedSignInIcon = duotone(LockKey, 'FailedSignIn');
export const CreatedIcon = duotone(PlusCircle, 'Created');
export const CancelledIcon = duotone(XCircle, 'Cancelled');
export const CoreModuleIcon = duotone(GearSix, 'CoreModule');
export const FieldIcon = duotone(ListMagnifyingGlass, 'Field');
export const PersonIcon = duotone(UserCircle, 'Person');
export const AnyoneIcon = duotone(Users, 'Anyone');
export const MoneyIcon = duotone(Coins, 'Money');

// Users, roles and My account (spec roles-permissions, P3)
export const UsersIcon = duotone(UserCircleGear, 'Users');
export const RolesIcon = duotone(ShieldCheck, 'Roles');
export const SystemAdminIcon = duotone(ShieldStar, 'SystemAdmin');
export const CustomRoleIcon = duotone(Sparkle, 'CustomRole');
export const TemporaryPasswordIcon = duotone(Key, 'TemporaryPassword');
export const PasswordIcon = duotone(LockKey, 'Password');
export const LockedIcon = duotone(LockSimple, 'Locked');
export const CopyIcon = duotone(Copy, 'Copy');
export const LinkedEmployeeIcon = duotone(IdentificationCard, 'LinkedEmployee');
export const EmailIcon = duotone(EnvelopeSimple, 'Email');
export const AddUserIcon = duotone(UserPlus, 'AddUser');
export const NoUserIcon = duotone(UserCircleDashed, 'NoUser');

