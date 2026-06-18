import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { N8nService } from './n8n.service';
import { N8nController } from './n8n.controller';

@Module({
  imports: [HttpModule],
  providers: [N8nService],
  controllers: [N8nController],
  exports: [N8nService],
})
export class N8nModule {}
