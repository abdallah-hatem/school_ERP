import type { Icon as PhosphorIcon, IconProps } from '@phosphor-icons/react';
import {
  ArchiveIcon as Archive,
  ArrowClockwiseIcon as ArrowClockwise,
  ArrowCounterClockwiseIcon as ArrowCounterClockwise,
  ArrowsClockwiseIcon as ArrowsClockwise,
  RepeatIcon as Repeat,
  BuildingsIcon as Buildings,
  CalculatorIcon as Calculator,
  ChalkboardTeacherIcon as ChalkboardTeacher,
  ClockAfternoonIcon as ClockAfternoon,
  BackpackIcon as Backpack,
  GraduationCapIcon as GraduationCap,
  ExamIcon as Exam,
  MoneyIcon as Money,
  SuitcaseIcon as Suitcase,
  BusIcon as Bus,
  UsersFourIcon as UsersFour,
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
  TableIcon as Table,
  ChartBarIcon as ChartBar,
  CalendarDotsIcon as CalendarDots,
  TreeStructureIcon as TreeStructure,
  UploadSimpleIcon as UploadSimple,
  UserCheckIcon as UserCheck,
  UserMinusIcon as UserMinus,
  UsersThreeIcon as UsersThree,
  WalletIcon as Wallet,
  WarningCircleIcon as WarningCircle,
  WarningIcon as Warning,
  InfoIcon as Info,
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
  LockSimpleOpenIcon as LockSimpleOpen,
  CopyIcon as Copy,
  IdentificationCardIcon as IdentificationCard,
  SparkleIcon as Sparkle,
  EnvelopeSimpleIcon as EnvelopeSimple,
  UserPlusIcon as UserPlus,
  UserCircleDashedIcon as UserCircleDashed,
  EraserIcon as Eraser,
  MicrosoftExcelLogoIcon as MicrosoftExcelLogo,
  FilePdfIcon as FilePdf,
  EqualsIcon as EquivalentRule,
  NotEqualsIcon as NotEquals,
  BellIcon as Bell,
  FileTextIcon as FileText,
  HandshakeIcon as Handshake,
  HourglassMediumIcon as HourglassMedium,
  ClockCountdownIcon as ClockCountdown,
  CalendarCheckIcon as CalendarCheck,
  ChecksIcon as Checks,
  BellRingingIcon as BellRinging,
  DeviceMobileIcon as DeviceMobile,
  DesktopIcon as Desktop,
  DownloadSimpleIcon as DownloadSimple,
  ExportIcon as ShareArrow,
  HouseIcon as House,
  ArrowUUpLeftIcon as ArrowUUpLeft,
  ArrowUUpRightIcon as ArrowUUpRight,
  BracketsCurlyIcon as BracketsCurly,
  BracketsSquareIcon as BracketsSquare,
  FloppyDiskIcon as FloppyDisk,
  ListNumbersIcon as ListNumbers,
  MagnifyingGlassMinusIcon as MagnifyingGlassMinus,
  MagnifyingGlassPlusIcon as MagnifyingGlassPlus,
  ScissorsIcon as Scissors,
  TextAlignCenterIcon as TextAlignCenter,
  TextAlignJustifyIcon as TextAlignJustify,
  TextAlignLeftIcon as TextAlignLeft,
  TextAlignRightIcon as TextAlignRight,
  TextBIcon as TextB,
  TextItalicIcon as TextItalic,
  TextUnderlineIcon as TextUnderline,
  SignatureIcon as Signature,
} from '@phosphor-icons/react/ssr';
import type { ComponentType, SVGProps } from 'react';
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
export const ContractsIcon = duotone(Handshake, 'Contracts');
export const LatenessIcon = duotone(Clock, 'Lateness');
export const PayrollIcon = duotone(Wallet, 'Payroll');
export const SettingsIcon = duotone(SlidersHorizontal, 'Settings');
/** One person list inside the HR module (the module itself is `HrModuleIcon`). */
export const StaffIcon = duotone(Users, 'Staff');
export const SignOutIcon = duotone(SignOut, 'SignOut');

// Modules (sidebar groups)
export const HrModuleIcon = duotone(UsersThree, 'HrModule');
export const AccountingModuleIcon = duotone(Calculator, 'AccountingModule');
export const SchoolModuleIcon = duotone(Backpack, 'SchoolModule');
export const TransportModuleIcon = duotone(Bus, 'TransportModule');
export const ParentPortalModuleIcon = duotone(UsersFour, 'ParentPortalModule');

// Coming pages (locked in the sidebar until their module lands)
export const StudentsIcon = duotone(Student, 'Students');
export const AcademicsIcon = duotone(GraduationCap, 'Academics');
export const AttendanceIcon = duotone(CalendarCheck, 'Attendance');
export const ExamsIcon = duotone(Exam, 'Exams');
export const LeaveIcon = duotone(Suitcase, 'Leave');
export const FeesIcon = duotone(Money, 'Fees');

// Employee facts
export const DepartmentIcon = duotone(Buildings, 'Department');
export const StageIcon = duotone(ChalkboardTeacher, 'Stage');
export const WorkSystemIcon = duotone(ClockAfternoon, 'WorkSystem');
/** A job title whose holders lead other staff (§3 direct managers). */
export const ManagesPeopleIcon = duotone(Users, 'ManagesPeople');
/** A catalogue violation that can be recorded several times a day (once per day off, §4). */
export const RepeatsInDayIcon = duotone(Repeat, 'RepeatsInDay');

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
/** A chart card's Table / Chart toggle, and the 6 / 12 months switch. */
export const TableIcon = duotone(Table, 'Table');
export const ChartIcon = duotone(ChartBar, 'Chart');
export const MonthsShortIcon = duotone(CalendarBlank, 'MonthsShort');
export const MonthsLongIcon = duotone(CalendarDots, 'MonthsLong');

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
/** Needs a look (a warning toast). */
export const WarningIcon = duotone(Warning, 'Warning');
/** A neutral fact (an info toast). */
export const InfoIcon = duotone(Info, 'Info');

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
export const ClearFiltersIcon = duotone(Eraser, 'ClearFilters');
export const OpenRecordIcon = duotone(ArrowSquareOut, 'OpenRecord');
export const SignInIcon = duotone(SignIn, 'SignIn');
// Not-found and error screens: the way back to the dashboard.
export const HomeIcon = duotone(House, 'Home');
export const FailedSignInIcon = duotone(LockKey, 'FailedSignIn');
export const CreatedIcon = duotone(PlusCircle, 'Created');
export const CancelledIcon = duotone(XCircle, 'Cancelled');
export const CoreModuleIcon = duotone(GearSix, 'CoreModule');
export const FieldIcon = duotone(ListMagnifyingGlass, 'Field');
export const PersonIcon = duotone(UserCircle, 'Person');
/*
 * The avatars of a person without a photo (owner, 2026-11-18; every person, 2026-11-19): the
 * classic default silhouette — a plain head-and-shoulders figure, the man with short hair and ears,
 * the woman with a bob, and a neutral one (no hair) for an account with no linked employee. Drawn on a 64 grid to fill the whole avatar tile (`size-full`); one flat `currentColor`
 * shape each (the avatar paints it white on a light grey tile). Mockup: `design/mockups/avatars-basic.html`.
 */
type SilhouetteProps = SVGProps<SVGSVGElement>;
const SILHOUETTE_FRAME = { viewBox: '0 0 64 64', fill: 'currentColor', 'aria-hidden': true, focusable: false } as const;

export function MaleSilhouetteIcon(props: SilhouetteProps) {
  return (
    <svg {...SILHOUETTE_FRAME} data-silhouette="male" {...props}>
      <path d="M7 64c2-9 9-12.5 17-15.5V42c-3.5-2.5-5.6-6.6-6.6-10.4-1.9-.1-3.1-1.8-3.1-3.9 0-1.6.7-2.8 1.8-3.3-.7-5.1-.3-10.5 3.6-14C23.3 7.1 28 6 32.5 6.2c2.6.1 4.6.6 6 1.4 1.4-.4 3 .1 3.8 1.6 2.8 1.4 4 4.5 3.9 8.2 0 2.4-.4 4.6-.9 6.7 1.2.4 2 1.7 2 3.4 0 2.2-1.3 3.9-3.2 4-1 3.9-3.1 7.9-6.6 10.4v6.5c8 3 15 6.5 17 15.5z" />
    </svg>
  );
}

export function PersonSilhouetteIcon(props: SilhouetteProps) {
  return (
    <svg {...SILHOUETTE_FRAME} data-silhouette="neutral" {...props}>
      <path d="M7 64c2-9 9-12.5 17-15.5v-6.4c-4.2-2.8-7-7.8-7-13.6C17 18.6 23.7 10 32 10s15 8.6 15 18.5c0 5.8-2.8 10.8-7 13.6v6.4c8 3 15 6.5 17 15.5z" />
    </svg>
  );
}

export function FemaleSilhouetteIcon(props: SilhouetteProps) {
  return (
    <svg {...SILHOUETTE_FRAME} data-silhouette="female" {...props}>
      <path d="M8 64c2-8 9.5-11.5 17-14v-9.4c-3.6.2-7.4-.5-10.4-2.2 2.4-2.6 2.9-6.2 2.9-9.9 0-5.6 1.9-10 5.6-12.8 2.6-2 5.6-2.9 8.9-2.9s6.3.9 8.9 2.9c3.7 2.8 5.6 7.2 5.6 12.8 0 3.7.5 7.3 2.9 9.9-3 1.7-6.8 2.4-10.4 2.2v9.4C46.5 52.5 54 56 56 64z" />
    </svg>
  );
}
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
// Sign-in locked by too many wrong passwords, and a System admin unlocking it (owner 2026-11-18).
export const UnlockIcon = duotone(LockSimpleOpen, 'Unlock');
export const CopyIcon = duotone(Copy, 'Copy');
export const LinkedEmployeeIcon = duotone(IdentificationCard, 'LinkedEmployee');
export const EmailIcon = duotone(EnvelopeSimple, 'Email');
export const AddUserIcon = duotone(UserPlus, 'AddUser');
export const NoUserIcon = duotone(UserCircleDashed, 'NoUser');

// Accounting (§10): payroll taxes, its exports, and the tax rule badge.
export const PayrollTaxesIcon = duotone(Receipt, 'PayrollTaxes');
export const ExcelIcon = duotone(MicrosoftExcelLogo, 'Excel');
export const PdfIcon = duotone(FilePdf, 'Pdf');
export const InsuredIcon = duotone(ShieldCheck, 'Insured');
export const SameRuleIcon = duotone(EquivalentRule, 'SameRule');
export const OtherRuleIcon = duotone(NotEquals, 'OtherRule');
// Notifications (§11): the bell, its actions and one icon per kind of notification.
export const NotificationsIcon = duotone(Bell, 'Notifications');
// The installed app and push alerts (2026-11-21).
export const DeviceAlertsIcon = duotone(BellRinging, 'DeviceAlerts');
export const PhoneDeviceIcon = duotone(DeviceMobile, 'PhoneDevice');
export const ComputerDeviceIcon = duotone(Desktop, 'ComputerDevice');
export const InstallAppIcon = duotone(DownloadSimple, 'InstallApp');
/** Safari's Share button (a square with an arrow up), for the Add to Home Screen steps. */
export const ShareIcon = duotone(ShareArrow, 'Share');
export const MarkAllReadIcon = duotone(Checks, 'MarkAllRead');
export const NotificationSettingsIcon = duotone(GearSix, 'NotificationSettings');
export const ContractEndIcon = duotone(FileText, 'ContractEnd');
// A contract's signed copy (owner, 2026-11-24): its pages, zoomed in and out, saved.
export const SignedCopyIcon = duotone(Signature, 'SignedCopy');
export const ZoomInIcon = duotone(MagnifyingGlassPlus, 'ZoomIn');
export const ZoomOutIcon = duotone(MagnifyingGlassMinus, 'ZoomOut');
export const DownloadIcon = duotone(DownloadSimple, 'Download');
export const ProbationEndIcon = duotone(HourglassMedium, 'ProbationEnd');
export const LatenessDueIcon = duotone(ClockCountdown, 'LatenessDue');
export const PayrollDueIcon = duotone(CalendarCheck, 'PayrollDue');

// Contract templates: the text editor's toolbar, fields, the preview's zoom
export const UndoIcon = duotone(ArrowUUpLeft, 'Undo');
export const RedoIcon = duotone(ArrowUUpRight, 'Redo');
export const BoldIcon = duotone(TextB, 'Bold');
export const ItalicIcon = duotone(TextItalic, 'Italic');
export const UnderlineIcon = duotone(TextUnderline, 'Underline');
export const AlignLeftIcon = duotone(TextAlignLeft, 'AlignLeft');
export const AlignCenterIcon = duotone(TextAlignCenter, 'AlignCenter');
export const AlignRightIcon = duotone(TextAlignRight, 'AlignRight');
export const AlignJustifyIcon = duotone(TextAlignJustify, 'AlignJustify');
export const NumberedListIcon = duotone(ListNumbers, 'NumberedList');
export const PageBreakIcon = duotone(Scissors, 'PageBreak');
export const OptionalPhraseIcon = duotone(BracketsSquare, 'OptionalPhrase');
export const ContractFieldIcon = duotone(BracketsCurly, 'ContractField');
export const SaveIcon = duotone(FloppyDisk, 'Save');
