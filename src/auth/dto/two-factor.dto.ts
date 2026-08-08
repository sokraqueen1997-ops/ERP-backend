import { IsString, MinLength } from 'class-validator';

export class EnableTwoFactorDto {
  @IsString()
  @MinLength(6)
  code!: string;
}

export class DisableTwoFactorDto {
  @IsString()
  @MinLength(1)
  password!: string;
}
