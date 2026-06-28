import { MailQueueService } from './mail-queue.service';
import { Contact } from '../campaigns/entities/contact.entity';

function makeService(): MailQueueService {
  return new MailQueueService(
    null as any, null as any, null as any, null as any, null as any,
  );
}

describe('MailQueueService — pure functions', () => {
  let service: MailQueueService;
  beforeEach(() => { service = makeService(); });

  describe('replaceMergeTags', () => {
    it('replaces all four merge tags', () => {
      const contact = { firstName: 'John', lastName: 'Doe', email: 'j@acme.com', company: 'Acme' } as Contact;
      expect(service.replaceMergeTags('Hi {{firstName}} {{lastName}} at {{company}} ({{email}})', contact))
        .toBe('Hi John Doe at Acme (j@acme.com)');
    });

    it('replaces the same tag appearing multiple times', () => {
      const contact = { firstName: 'Alice' } as Contact;
      expect(service.replaceMergeTags('{{firstName}}{{firstName}}', contact)).toBe('AliceAlice');
    });

    it('treats null/undefined values as empty string', () => {
      const contact = { firstName: null, lastName: undefined } as any;
      expect(service.replaceMergeTags('{{firstName}}|{{lastName}}', contact)).toBe('|');
    });
  });

  describe('injectPixel', () => {
    it('inserts pixel before </body>', () => {
      const html = '<html><body>Hello</body></html>';
      const result = service.injectPixel(html, 7, 'hub.example.com');
      expect(result.indexOf('track/open/7.gif')).toBeLessThan(result.indexOf('</body>'));
    });

    it('appends pixel when no </body> present', () => {
      const result = service.injectPixel('<p>Hi</p>', 3, 'hub.example.com');
      expect(result).toContain('track/open/3.gif');
      expect(result.startsWith('<p>')).toBe(true);
    });

    it('pixel URL uses the provided domain', () => {
      const result = service.injectPixel('', 1, 'my.domain.com');
      expect(result).toContain('https://my.domain.com/mails-api/track/open/1.gif');
    });
  });
});
