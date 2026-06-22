import { IsBoolean } from 'class-validator';
export class DeviceUpdateDto {
  @IsBoolean()
  isPermanent: boolean;
}
