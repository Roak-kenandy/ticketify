import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AddTicketHelperDto {
  /** mPro user id of the Medianet technician to add as helper. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  user_id!: string;
}
