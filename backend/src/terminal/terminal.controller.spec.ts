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
});
