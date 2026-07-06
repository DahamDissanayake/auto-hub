import { Controller, Get, Post, Delete, Param, Body, ParseIntPipe } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { ContactDto } from './dto/add-contacts.dto';

@Controller('campaigns')
export class CampaignsController {
  constructor(private service: CampaignsService) {}

  @Get()
  findAll() { return this.service.findAll(); }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.service.findOne(id); }

  @Post()
  create(@Body() dto: CreateCampaignDto) { return this.service.create(dto); }

  @Post(':id/contacts')
  addContacts(@Param('id', ParseIntPipe) id: number, @Body() contacts: ContactDto[]) {
    return this.service.addContacts(id, contacts);
  }

  @Post(':id/launch')
  launch(@Param('id', ParseIntPipe) id: number) { return this.service.launch(id); }

  @Post(':id/pause')
  pause(@Param('id', ParseIntPipe) id: number) { return this.service.pause(id); }

  @Post(':id/resume')
  resume(@Param('id', ParseIntPipe) id: number) { return this.service.resume(id); }

  @Post(':id/retry-failed')
  retryFailed(@Param('id', ParseIntPipe) id: number) { return this.service.retryFailed(id); }

  @Get(':id/logs')
  getLogs(@Param('id', ParseIntPipe) id: number) { return this.service.getLogs(id); }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }
}
