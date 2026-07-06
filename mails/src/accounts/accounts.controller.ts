import { Controller, Get, Post, Delete, Patch, Param, Body, ParseIntPipe } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Controller('accounts')
export class AccountsController {
  constructor(private service: AccountsService) {}

  @Get()
  findAll() { return this.service.findAll(); }

  @Post()
  create(@Body() dto: CreateAccountDto) { return this.service.create(dto); }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAccountDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/default')
  setDefault(@Param('id', ParseIntPipe) id: number) { return this.service.setDefault(id); }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }
}
