import { Injectable, ServiceUnavailableException, BadRequestException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

@Injectable()
export class N8nService {
  private readonly logger = new Logger(N8nService.name);
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

  private handleN8nError(err: unknown): never {
    const axiosErr = err as AxiosError;
    if (axiosErr?.response?.status === 401) {
      throw new ServiceUnavailableException('N8N_API_KEY is invalid or has been revoked — regenerate it in n8n Settings → API');
    }
    if (axiosErr?.code === 'ECONNREFUSED' || axiosErr?.code === 'ENOTFOUND') {
      throw new ServiceUnavailableException('Cannot reach n8n — is it running?');
    }
    this.logger.error(`n8n API error: ${axiosErr?.message ?? String(err)}`);
    throw new ServiceUnavailableException('n8n API error');
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
    try {
      const { data } = await firstValueFrom(
        this.httpService.get(`${this.n8nUrl}/api/v1/workflows`, { headers: this.headers }),
      );
      return data;
    } catch (err) { this.handleN8nError(err); }
  }

  async getWorkflow(id: string) {
    this.checkApiKey();
    this.validateWorkflowId(id);
    try {
      const { data } = await firstValueFrom(
        this.httpService.get(`${this.n8nUrl}/api/v1/workflows/${id}`, { headers: this.headers }),
      );
      return data;
    } catch (err) { this.handleN8nError(err); }
  }

  async activateWorkflow(id: string) {
    this.checkApiKey();
    this.validateWorkflowId(id);
    try {
      const { data } = await firstValueFrom(
        this.httpService.post(
          `${this.n8nUrl}/api/v1/workflows/${id}/activate`,
          {},
          { headers: this.headers },
        ),
      );
      return data;
    } catch (err) { this.handleN8nError(err); }
  }

  async deactivateWorkflow(id: string) {
    this.checkApiKey();
    this.validateWorkflowId(id);
    try {
      const { data } = await firstValueFrom(
        this.httpService.post(
          `${this.n8nUrl}/api/v1/workflows/${id}/deactivate`,
          {},
          { headers: this.headers },
        ),
      );
      return data;
    } catch (err) { this.handleN8nError(err); }
  }

  async getExecutions() {
    this.checkApiKey();
    try {
      const { data } = await firstValueFrom(
        this.httpService.get(`${this.n8nUrl}/api/v1/executions`, { headers: this.headers }),
      );
      return data;
    } catch (err) { this.handleN8nError(err); }
  }
}
