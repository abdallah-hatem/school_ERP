/*
 * Front door of core/employees: what every screen needs to point at an employee — the profile's
 * path and the name that links to it. In core, so HR's screens and core/audit alike may import it.
 */
export { EmployeeLink, employeePath, type EmployeeLinkProps } from './employee-link';
