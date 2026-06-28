import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import * as ExcelJS from 'exceljs';

@Controller('template')
export class TemplateController {
  @Get('contacts.xlsx')
  async download(@Res() res: Response) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Contacts');
    ws.columns = [
      { header: 'firstName', key: 'firstName', width: 15 },
      { header: 'lastName',  key: 'lastName',  width: 15 },
      { header: 'email',     key: 'email',     width: 30 },
      { header: 'company',   key: 'company',   width: 20 },
    ];
    ws.addRow({ firstName: 'John', lastName: 'Doe', email: 'john@example.com', company: 'Acme Corp' });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename=contacts_template.xlsx');
    await wb.xlsx.write(res);
    res.end();
  }
}
