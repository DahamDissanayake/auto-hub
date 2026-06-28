export class CreateAccountDto {
  email: string;
  displayName: string;
  appPassword: string;
  isDefault?: boolean;
}
