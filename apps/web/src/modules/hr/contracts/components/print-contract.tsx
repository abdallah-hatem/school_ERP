'use client';

import { ContractStatus, type Contract } from '@school-erp/shared';
import { useState, type ReactNode } from 'react';
import { useCan } from '@/core/auth';
import type { RowAction } from '@/shared/components/data-table/row-actions';
import { Button } from '@/shared/components/ui/button';
import { PrintIcon } from '@/shared/components/ui/icons';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { PrintContractDialog, type PrintableContract } from './print-contract-dialog';

/*
 * Where "Print contract" shows (spec → Printing): for whoever may manage contracts, never on one's
 * own contract (`OWN_CONTRACT`, edge case 1), never on a cancelled one (`CONTRACT_CANCELLED`, edge
 * case 13). Current, upcoming, ended and not-renewed contracts all print. View only: the API
 * decides.
 */

export function canPrintContract(contract: Pick<Contract, 'ownContract' | 'status'>, can: (key: 'hr.contracts.manage') => boolean): boolean {
  return can('hr.contracts.manage') && !contract.ownContract && contract.status !== ContractStatus.CANCELLED;
}

/** The employee's Contracts tab: a "Print contract" button on the row. */
export function PrintContractButton({ contract }: { contract: Contract }) {
  const { t } = useTranslation();
  const can = useCan();
  const [open, setOpen] = useState(false);
  if (!canPrintContract(contract, can)) return null;
  return (
    <>
      <Button size="sm" variant="secondary" className="cursor-pointer" onClick={() => setOpen(true)}>
        <PrintIcon />
        {t('contractTemplates.print.button')}
      </Button>
      {open ? <PrintContractDialog contract={contract} open onOpenChange={setOpen} /> : null}
    </>
  );
}

/**
 * HR → Contracts: the row's ⋯ items. A renewed row offers both of its contracts — this year's and
 * the renewal's next one (printed and signed before it starts).
 */
export function usePrintContractMenu(contract: Contract): { actions: RowAction[]; dialog: ReactNode } {
  const { t } = useTranslation();
  const can = useCan();
  const [printing, setPrinting] = useState<PrintableContract | null>(null);
  if (!canPrintContract(contract, can)) return { actions: [], dialog: null };
  const next = contract.next ? { ...contract.next, employee: contract.employee } : null;
  const actions: RowAction[] = next
    ? [
        { id: 'printThisYear', label: t('contractTemplates.print.thisYear'), icon: PrintIcon, onSelect: () => setPrinting(contract) },
        { id: 'printNextYear', label: t('contractTemplates.print.nextYear'), icon: PrintIcon, onSelect: () => setPrinting(next) },
      ]
    : [{ id: 'print', label: t('contractTemplates.print.button'), icon: PrintIcon, onSelect: () => setPrinting(contract) }];
  const dialog = printing ? (
    <PrintContractDialog key={printing.id} contract={printing} open onOpenChange={(o) => !o && setPrinting(null)} />
  ) : null;
  return { actions, dialog };
}
