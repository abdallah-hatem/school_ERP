import { NewEmployeeSignedContract } from '@/modules/hr/contracts';
import { EmployeePageSkeleton } from '@/modules/hr/employees';

export default function NewEmployeeLoading() {
  // The same parts as the page: the signed contract sits in the contract section there too.
  return <EmployeePageSkeleton contractExtra={<NewEmployeeSignedContract />} />;
}
