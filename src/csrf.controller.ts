import { Controller, Get, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { CsrfService } from './csrf.service';

@Controller('csrf')
export class CsrfController {
  constructor(private readonly csrfService: CsrfService) {}

  @Get('token')
  getToken(@Req() req: Request, @Res() res: Response) {
    const token = this.csrfService.generateToken();
    res.cookie('XSRF-TOKEN', token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    return res.json({ token });
  }
}