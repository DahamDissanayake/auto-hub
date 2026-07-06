export class CreateAccountDto {
  email: string;
  displayName: string;
  appPassword: string;
  smtpUser?: string;
  signature?: string;
  isDefault?: boolean;
}
