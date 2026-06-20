import { Controller, Get, Post, Body, Headers, HttpException, HttpStatus } from '@nestjs/common';

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

const LABEL_MAP: Record<string, string> = {
  '/workspace/home': 'Home',
  '/workspace/repo': 'Repos',
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
}
