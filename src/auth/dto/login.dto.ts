import { IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  usernameOrEmail!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @IsOptional()
  @IsString()
  twoFactorCode?: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken!: string;
}
