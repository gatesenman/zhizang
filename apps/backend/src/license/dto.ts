import { IsEmail, IsString, MinLength } from 'class-validator';

export class ActivateDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(4) code!: string;
  @IsString() @MinLength(4) deviceId!: string;
}
