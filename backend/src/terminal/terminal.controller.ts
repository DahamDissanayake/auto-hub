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

interface ClaudeProfilesMeta {
  active: string | null;
  profiles: { name: string; addedAt: string }[];
}

interface StartLoginBody {
  name: string;
}

interface CompleteLoginBody {
  sessionId: string;
  code: string;
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

  @Get('claude-profiles')
  async getClaudeProfiles(@Headers('authorization') auth: string): Promise<ClaudeProfilesMeta> {
    let res: Response;
    try {
      res = await fetch(`${TERMINAL_SERVICE}/claude-profiles`, {
        headers: { authorization: auth ?? '' },
      });
    } catch {
      throw new HttpException('Terminal service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!res.ok) throw new HttpException(await res.text(), res.status);
    return res.json() as Promise<ClaudeProfilesMeta>;
  }

  @Post('claude-profiles/login/start')
  async startClaudeLogin(
    @Body() body: StartLoginBody,
    @Headers('authorization') auth: string,
  ): Promise<{ sessionId: string; url: string }> {
    let res: Response;
    try {
      res = await fetch(`${TERMINAL_SERVICE}/claude-profiles/login/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: auth ?? '' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new HttpException('Terminal service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!res.ok) throw new HttpException(await res.json() as object, res.status);
    return res.json() as Promise<{ sessionId: string; url: string }>;
  }

  @Post('claude-profiles/login/complete')
  async completeClaudeLogin(
    @Body() body: CompleteLoginBody,
    @Headers('authorization') auth: string,
  ): Promise<{ ok: boolean }> {
    let res: Response;
    try {
      res = await fetch(`${TERMINAL_SERVICE}/claude-profiles/login/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: auth ?? '' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new HttpException('Terminal service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!res.ok) throw new HttpException(await res.json() as object, res.status);
    return res.json() as Promise<{ ok: boolean }>;
  }

  @Post('claude-profiles/:name/activate')
  async activateClaudeProfile(
    @Param('name') name: string,
    @Headers('authorization') auth: string,
  ): Promise<{ ok: boolean }> {
    let res: Response;
    try {
      res = await fetch(`${TERMINAL_SERVICE}/claude-profiles/${encodeURIComponent(name)}/activate`, {
        method: 'POST',
        headers: { authorization: auth ?? '' },
      });
    } catch {
      throw new HttpException('Terminal service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!res.ok) throw new HttpException(await res.json() as object, res.status);
    return res.json() as Promise<{ ok: boolean }>;
  }

  @Delete('claude-profiles/:name')
  async deleteClaudeProfile(
    @Param('name') name: string,
    @Headers('authorization') auth: string,
  ): Promise<{ ok: boolean }> {
    let res: Response;
    try {
      res = await fetch(`${TERMINAL_SERVICE}/claude-profiles/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: { authorization: auth ?? '' },
      });
    } catch {
      throw new HttpException('Terminal service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!res.ok) throw new HttpException(await res.text(), res.status);
    return res.json() as Promise<{ ok: boolean }>;
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
