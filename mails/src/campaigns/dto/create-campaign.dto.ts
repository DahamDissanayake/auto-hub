export class CreateCampaignDto {
  name: string;
  fromAccountId: number;
  subject: string;
  bodyHtml: string;
  scheduledAt?: string;
  ratePerHour?: number;
}
