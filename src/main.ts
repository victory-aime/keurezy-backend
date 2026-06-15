import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import figlet from 'figlet';
import * as express from 'express';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { setupSwagger } from './config/swagger';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { toNodeHandler } from 'better-auth/node';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as process from 'node:process';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  console.log('\n========== PROJECT ENV ==========');

  const projectEnvs = [
    'NODE_ENV',
    'DATABASE_URL',
    'DIRECT_URL',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'BETTER_AUTH_URL',
    'BETTER_AUTH_SECRET',
    'APP_NAME',
    'WEB_APP_URL',
    'PORT',
    'FRONTEND_EMAIL_VERIFIED_URL',
    'FRONTEND_RESET_PASSWORD_URL',
    'FRONTEND_VERIFY_INVITATION_URL',
    'RESEND_TEMPLATE_TEAM_INVITE_ID',
    'RESEND_TEMPLATE_EMAIL_VERIFY_ID',
    'RESEND_TEMPLATE_RESET_PASSWORD_ID',
    'RESEND_TEMPLATE_UPDATE_EMAIL_ID',
    'RESEND_CLIENT_EMAIL',
    'RESEND_API_KEY',
    'INVITATION_ENCRYPTION_KEY',
    'COOKIE_DOMAIN',
  ];

  projectEnvs.forEach((key) => {
    const value = process.env[key];

    console.log(`${key}=${value}`);
  });

  console.log('=================================\n');
  // Access Express instance
  const expressApp = app.getHttpAdapter().getInstance();

  // Access BetterAuth instance from AuthService
  const authService = app.get<AuthService>(AuthService);

  expressApp.use((req, res, next) => {
    const allowedOrigins = process.env.TRUSTED_ORIGINS!.split(',').map((origin) => origin.trim());

    const origin = req.headers.origin;

    const isAllowed = !!origin && allowedOrigins.includes(origin);

    if (isAllowed) {
      res.header('Access-Control-Allow-Origin', origin);
    }

    res.header('Access-Control-Allow-Credentials', 'true');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    );
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    next();
  });

  // Mount BetterAuth before body parsers
  expressApp.all(/^\/api\/auth\/.*/, toNodeHandler(authService.instance.handler));

  // Re-enable Nest's JSON body parser AFTER mounting BetterAuth
  expressApp.use(express.json());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));
  setupSwagger(app);

  await app.listen(process.env.PORT!, async () => {
    figlet(`${new Date().getFullYear()}- ${process.env.APP_NAME}`, (_, data) => {
      console.log('\x1b[1m\x1b[32m%s\x1b[0m', data);
      figlet('Powered By VICTORY', { font: 'Small' }, (a, res) =>
        console.log('\x1b[35m%s\x1b[0m', res),
      );
    });
  });
}
bootstrap();
