import { Controller, Get, Post, Delete, Body, Headers, Param, HttpException, HttpStatus } from '@nestjs/common';

interface DirEntry {
  label: string;
  path: string;
}

interface RepoEntry {
  name: string;
  path: string;
  isGitRepo: boolean;
}

interface CloneBody {
  url: string;
  name?: string;
}

interface SessionEntry {
  name: string;
  cwd: string;
  workspace: string;
  repoName: string | null;
  alive: boolean;
  lastActive: string;
  createdAt: string;
}

interface CreateSessionBody {
  name: string;
  cwd: string;
  workspace: string;
  repoName?: string;
}

const LABEL_MAP: Record<string, string> = {
  '/workspace/home': 'Home',
  '/workspace/repo': 'Repos',
  '/workspace/data': 'Data Storage',
  '/workspace/github': 'GitHub Repos',
  '/workspace/auto-hub': 'Auto-Hub',
};

const TERMINAL_SERVICE = 'http://terminal:7681';

@Controller('terminal')
export class TerminalController {
  @Get('dirs')
  getDirs(): DirEntry[] {
    return (process.env.TERMINAL_DIRS ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(path => ({
        label: LABEL_MAP[path] ?? path.split('/').pop() ?? path,
        path,
      }));
  }

  @Get('repos')
  async getRepos(@Headers('authorization') auth: string): Promise<RepoEntry[]> {
    let res: Response;
    try {
      res = await fetch(`${TERMINAL_SERVICE}/repos`, {
        headers: { authorization: auth ?? '' },
      });
    } catch {
      throw new HttpException('Terminal service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!res.ok) throw new HttpException(await res.text(), res.status);
    return res.json() as Promise<RepoEntry[]>;
  }

  @Post('clone')
  async cloneRepo(
    @Body() body: CloneBody,
    @Headers('authorization') auth: string,
  ): Promise<{ path: string }> {
    let res: Response;
    try {
      res = await fetch(`${TERMINAL_SERVICE}/clone`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: auth ?? '' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new HttpException('Terminal service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!res.ok) throw new HttpException(await res.json() as object, res.status);
    return res.json() as Promise<{ path: string }>;
  }

  @Get('sessions')
  async getSessions(@Headers('authorization') auth: string): Promise<SessionEntry[]> {
    let res: Response;
    try {
      res = await fetch(`${TERMINAL_SERVICE}/sessions`, {
        headers: { authorization: auth ?? '' },
      });
    } catch {
      throw new HttpException('Terminal service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!res.ok) throw new HttpException(await res.text(), res.status);
    return res.json() as Promise<SessionEntry[]>;
  }

  @Post('sessions')
  async createSession(
    @Body() body: CreateSessionBody,
    @Headers('authorization') auth: string,
  ): Promise<SessionEntry> {
    let res: Response;
    try {
      res = await fetch(`${TERMINAL_SERVICE}/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: auth ?? '' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new HttpException('Terminal service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!res.ok) throw new HttpException(await res.json() as object, res.status);
    return res.json() as Promise<SessionEntry>;
  }

  @Delete('sessions/:name')
  async deleteSession(
    @Param('name') name: string,
    @Headers('authorization') auth: string,
  ): Promise<{ ok: boolean }> {
    let res: Response;
    try {
      res = await fetch(`${TERMINAL_SERVICE}/sessions/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: { authorization: auth ?? '' },
      });
    } catch {
      throw new HttpException('Terminal service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!res.ok) throw new HttpException(await res.text(), res.status);
    return res.json() as Promise<{ ok: boolean }>;
  }
}
