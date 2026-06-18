import { Test, TestingModule } from '@nestjs/testing';
import { N8nService } from './n8n.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { of } from 'rxjs';

describe('N8nService', () => {
  it('throws ServiceUnavailableException when N8N_API_KEY is empty', async () => {
    const module = await Test.createTestingModule({
      providers: [
        N8nService,
        { provide: HttpService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('') } },
      ],
    }).compile();
    const service = module.get<N8nService>(N8nService);
    await expect(service.getWorkflows()).rejects.toThrow(ServiceUnavailableException);
  });

  it('calls n8n API with X-N8N-API-KEY header when key is set', async () => {
    const mockGet = jest.fn().mockReturnValue(of({ data: { data: [] } }));
    const module = await Test.createTestingModule({
      providers: [
        N8nService,
        { provide: HttpService, useValue: { get: mockGet } },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'N8N_API_KEY') return 'test-api-key';
              if (key === 'N8N_URL') return 'http://n8n:5678';
              return undefined;
            }),
          },
        },
      ],
    }).compile();
    const service = module.get<N8nService>(N8nService);
    await service.getWorkflows();
    expect(mockGet).toHaveBeenCalledWith(
      'http://n8n:5678/api/v1/workflows',
      { headers: { 'X-N8N-API-KEY': 'test-api-key' } },
    );
  });
});
