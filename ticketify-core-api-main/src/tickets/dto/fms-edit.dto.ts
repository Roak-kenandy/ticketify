import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class FmsPriorityDto {
  @IsString()
  @IsNotEmpty()
  priority_id!: string;

  @IsString()
  @IsNotEmpty()
  comment!: string;
}

export class FmsStatusDto {
  @IsString()
  @IsNotEmpty()
  ticket_status!: string;

  @IsString()
  @IsNotEmpty()
  ticket_sub_comment!: string;

  @IsString()
  @IsNotEmpty()
  comment!: string;
}

export class FmsQueueDto {
  @IsString()
  @IsNotEmpty()
  que_id!: string;

  @IsString()
  @IsNotEmpty()
  t_subcat!: string;

  @IsString()
  @IsNotEmpty()
  comment!: string;
}

export class FmsCategoryDto {
  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsString()
  @IsNotEmpty()
  sub_category!: string;

  @IsString()
  @IsNotEmpty()
  comment!: string;
}

export class FmsAssignDto {
  @IsOptional()
  @IsString()
  user_id?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

/** Relocation-only customer installation address (identity fields stay on FMS). */
export class FmsAddressDto {
  @IsString()
  @IsNotEmpty()
  address1!: string;

  @IsOptional()
  @IsString()
  address2?: string;

  @IsString()
  @IsNotEmpty()
  street!: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  zip?: string;

  @IsString()
  @IsNotEmpty()
  country_id!: string;

  @IsString()
  @IsNotEmpty()
  atoll_id!: string;

  @IsString()
  @IsNotEmpty()
  island_id!: string;
}
