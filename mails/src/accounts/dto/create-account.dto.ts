export class CreateAccountDto {
  email: string;
  displayName: string;
  appPassword: string;
  smtpUser?: string;
  isDefault?: boolean;
}
