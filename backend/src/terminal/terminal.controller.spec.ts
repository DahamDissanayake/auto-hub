import { HttpException } from '@nestjs/common';
import { TerminalController } from './terminal.controller';

describe('TerminalController', () => {
  let controller: TerminalController;

  beforeEach(() => {
    controller = new TerminalController();
  });

  afterEach(() => {
    delete process.env.TERMINAL_DIRS;
  });

  it('returns mapped labels for known paths', () => {
    process.env.TERMINAL_DIRS = '/workspace/home,/workspace/repo';
    expect(controller.getDirs()).toEqual([
      { label: 'Home', path: '/workspace/home' },
      { label: 'Repos', path: '/workspace/repo' },
    ]);
  });

  it('uses last path segment as label for unknown paths', () => {
    process.env.TERMINAL_DIRS = '/workspace/ssd';
    expect(controller.getDirs()).toEqual([
      { label: 'ssd', path: '/workspace/ssd' },
    ]);
  });

  it('returns empty array when TERMINAL_DIRS is not set', () => {
    expect(controller.getDirs()).toEqual([]);
  });

  it('trims whitespace from paths', () => {
    process.env.TERMINAL_DIRS = ' /workspace/home , /workspace/repo ';
    const result = controller.getDirs();
    expect(result[0].path).toBe('/workspace/home');
    expect(result[1].path).toBe('/workspace/repo');
  });

  describe('getRepos', () => {
    afterEach(() => jest.resetAllMocks());

    it('proxies to terminal service forwarding auth header', async () => {
      const mockRepos = [{ name: 'auto-hub', path: '/workspace/github/auto-hub', isGitRepo: true }];
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockRepos,
      } as unknown as Response);

      const result = await controller.getRepos('Bearer test-token');

      expect(global.fetch).toHaveBeenCalledWith('http://terminal:7681/repos', {
        headers: { authorization: 'Bearer test-token' },
      });
      expect(result).toEqual(mockRepos);
    });

    it('throws 503 when terminal service is unreachable', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(controller.getRepos('Bearer token')).rejects.toThrow(HttpException);
    });

    it('throws with upstream status when terminal service returns error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      } as unknown as Response);
      await expect(controller.getRepos('Bearer bad')).rejects.toThrow(HttpException);
    });
  });

  describe('cloneRepo', () => {
    afterEach(() => jest.resetAllMocks());

    it('proxies clone request forwarding auth header', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ path: '/workspace/github/my-repo' }),
      } as unknown as Response);

      const result = await controller.cloneRepo(
        { url: 'https://github.com/u/my-repo' },
        'Bearer test-token',
      );

      expect(global.fetch).toHaveBeenCalledWith('http://terminal:7681/clone', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
        body: JSON.stringify({ url: 'https://github.com/u/my-repo' }),
      });
      expect(result).toEqual({ path: '/workspace/github/my-repo' });
    });

    it('throws 503 when terminal service is unreachable', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(
        controller.cloneRepo({ url: 'https://github.com/u/r' }, 'Bearer token'),
      ).rejects.toThrow(HttpException);
    });

    it('throws with clone error payload when terminal service returns error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: 'Directory already exists' }),
      } as unknown as Response);
      await expect(
        controller.cloneRepo({ url: 'https://github.com/u/r' }, 'Bearer token'),
      ).rejects.toThrow(HttpException);
    });
  });
});
