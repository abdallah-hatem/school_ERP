import {
  CONTRACT_COPY_OUTPUTS,
  CONTRACT_LANGUAGES,
  type ContractCopyOutput,
  type ContractDocument,
  type ContractLanguage,
  type CreateContractCopyRequest,
} from '@school-erp/shared';
import { Type } from 'class-transformer';
import { IsHexadecimal, IsIn, IsInt, IsObject, IsOptional, IsUUID, Length, Min } from 'class-validator';

/** `GET /hr/contracts/:id/print?templateId=&language=`. */
export class ContractPrintQueryDto {
  @IsUUID()
  templateId!: string;

  @IsIn(CONTRACT_LANGUAGES)
  language!: ContractLanguage;
}

/** `POST /hr/contracts/:id/copies` — `bodyEdited` is checked by the shared document schema in the service. */
export class CreateContractCopyDto implements CreateContractCopyRequest {
  @IsUUID()
  templateId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  templateVersion!: number;

  @IsIn(CONTRACT_LANGUAGES)
  language!: ContractLanguage;

  @IsHexadecimal()
  @Length(64, 64)
  valuesHash!: string;

  @IsOptional()
  @IsObject()
  bodyEdited?: ContractDocument;

  @IsIn(CONTRACT_COPY_OUTPUTS)
  output!: ContractCopyOutput;
}
