import { Controller, Get, Post, Param } from '@nestjs/common';
import { N8nService } from './n8n.service';

@Controller('n8n')
export class N8nController {
  constructor(private n8nService: N8nService) {}

  @Get('workflows')
  getWorkflows() { return this.n8nService.getWorkflows(); }

  @Get('workflows/:id')
  getWorkflow(@Param('id') id: string) { return this.n8nService.getWorkflow(id); }

  @Post('workflows/:id/activate')
  activate(@Param('id') id: string) { return this.n8nService.activateWorkflow(id); }

  @Post('workflows/:id/deactivate')
  deactivate(@Param('id') id: string) { return this.n8nService.deactivateWorkflow(id); }

  @Get('executions')
  getExecutions() { return this.n8nService.getExecutions(); }
}
