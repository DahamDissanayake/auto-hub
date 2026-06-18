import { Injectable, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class N8nService {
  private readonly n8nUrl: string;
  private readonly apiKey: string;

  constructor(
    private httpService: HttpService,
    private config: ConfigService,
  ) {
    this.n8nUrl = config.get<string>('N8N_URL') ?? 'http://n8n:5678';
    this.apiKey = config.get<string>('N8N_API_KEY') ?? '';
  }

  private checkApiKey() {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('N8N_API_KEY not configured');
    }
  }

  private validateWorkflowId(id: string): void {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new BadRequestException(`Invalid workflow id: "${id}"`);
    }
  }

  private get headers() {
    return { 'X-N8N-API-KEY': this.apiKey };
  }

  async getWorkflows() {
    this.checkApiKey();
    const { data } = await firstValueFrom(
      this.httpService.get(`${this.n8nUrl}/api/v1/workflows`, { headers: this.headers }),
    );
    return data;
  }

  async getWorkflow(id: string) {
    this.checkApiKey();
    this.validateWorkflowId(id);
    const { data } = await firstValueFrom(
      this.httpService.get(`${this.n8nUrl}/api/v1/workflows/${id}`, { headers: this.headers }),
    );
    return data;
  }

  async activateWorkflow(id: string) {
    this.checkApiKey();
    this.validateWorkflowId(id);
    const { data } = await firstValueFrom(
      this.httpService.post(
        `${this.n8nUrl}/api/v1/workflows/${id}/activate`,
        {},
        { headers: this.headers },
      ),
    );
    return data;
  }

  async deactivateWorkflow(id: string) {
    this.checkApiKey();
    this.validateWorkflowId(id);
    const { data } = await firstValueFrom(
      this.httpService.post(
        `${this.n8nUrl}/api/v1/workflows/${id}/deactivate`,
        {},
        { headers: this.headers },
      ),
    );
    return data;
  }

  async getExecutions() {
    this.checkApiKey();
    const { data } = await firstValueFrom(
      this.httpService.get(`${this.n8nUrl}/api/v1/executions`, { headers: this.headers }),
    );
    return data;
  }
}
