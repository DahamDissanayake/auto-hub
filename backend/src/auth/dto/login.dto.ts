import { IsString, IsOptional } from 'class-validator';

export class LoginDto {
  @IsString()
  password: string;

  @IsString()
  @IsOptional()
  deviceToken?: string;
}
