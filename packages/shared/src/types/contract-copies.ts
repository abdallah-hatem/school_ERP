import type { ContractLanguage } from '../contract-document/fields';
import type { IsoDateTime, Uuid } from './common';

/*
 * Printed copies of a contract (spec docs/specs/2026-11-24-contract-templates.md → Printed copies):
 * kept on the contract, never changed afterwards. Their own file so `types/contracts.ts` can list a
 * contract's copies without a cycle through the templates' types.
 */

/** How a copy was made: the Print button (the PDF opened in the print dialog) or Download PDF. */
export const ContractCopyOutput = { PRINT: 'PRINT', PDF: 'PDF' } as const;
export type ContractCopyOutput = (typeof ContractCopyOutput)[keyof typeof ContractCopyOutput];
export const CONTRACT_COPY_OUTPUTS = Object.values(ContractCopyOutput) as ContractCopyOutput[];

/** How many of a contract's newest copies come inside its row and the print dialog; the rest are paged. */
export const CONTRACT_COPIES_SHOWN = 5;

export interface ContractPersonRef {
  id: Uuid | null;
  name: string;
}

/** A copy printed of a contract — never changed afterwards. */
export interface ContractCopy {
  id: Uuid;
  contractId: Uuid;
  templateId: Uuid;
  /** The template's names as printed. */
  templateNameEn: string;
  templateNameAr: string;
  templateVersion: number;
  language: ContractLanguage;
  textEdited: boolean;
  containsSalary: boolean;
  output: ContractCopyOutput;
  pageCount: number;
  /** `/files/contract-copies/<name>`; null when the reader may not open it (a salary they can't see). */
  fileUrl: string | null;
  /** `<code>-<contract year>-<template>.pdf`, never typed text. */
  downloadName: string;
  printedBy: ContractPersonRef;
  printedAt: IsoDateTime;
  /**
   * Reserved for the signed scan (contracts round 3): the signed copy linked to this printed one.
   * Always false until that upload exists.
   */
  signed: boolean;
}

